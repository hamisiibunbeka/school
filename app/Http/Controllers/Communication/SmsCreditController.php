<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Models\SmsCreditTransaction;
use App\Models\SmsOrder;
use App\Models\SmsPackage;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Services\Messaging\SmsCredits;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** The school's SMS wallet: balance, buying bundles from the platform's packages, history. */
class SmsCreditController extends Controller
{
    public const PAYMENT_METHODS = ['mobile_money', 'bank_transfer', 'cash', 'other'];

    public function __construct(private SmsCredits $credits) {}

    public function index(): Response
    {
        $tenant = $this->tenancy()->tenant();
        $tenantId = $tenant?->id;

        $driver = DB::connection()->getDriverName();
        $monthExpr = $driver === 'sqlite' ? "strftime('%Y-%m', created_at)" : "DATE_FORMAT(created_at, '%Y-%m')";
        $usage = DB::table('message_logs')->where('tenant_id', $tenantId)->where('channel', 'sms')->where('status', '!=', 'failed')
            ->where('created_at', '>=', now()->subMonths(5)->startOfMonth())
            ->selectRaw("$monthExpr as ym, SUM(credits) as credits")->groupBy('ym')->pluck('credits', 'ym');

        return Inertia::render('communication/sms-credits', [
            'balance' => $this->credits->balance($tenant),
            'plan' => $tenant?->plan?->name,
            'packages' => SmsPackage::where('is_active', true)->orderBy('sort_order')->orderBy('credits')->get()
                ->map(fn (SmsPackage $p) => [
                    'id' => $p->id, 'name' => $p->name, 'credits' => $p->credits, 'price' => (string) $p->price,
                    'per_sms' => $p->pricePerSms(), 'description' => $p->description, 'is_popular' => $p->is_popular,
                ]),
            'orders' => SmsOrder::where('tenant_id', $tenantId)->with(['requester:id,name', 'school:id,name'])->latest('id')->limit(50)->get()
                ->map(fn (SmsOrder $o) => $this->orderRow($o)),
            'ledger' => SmsCreditTransaction::where('tenant_id', $tenantId)->with('user:id,name')->latest('id')->limit(30)->get()
                ->map(fn ($t) => ['id' => $t->id, 'type' => $t->type, 'credits' => $t->credits, 'balance_after' => $t->balance_after, 'description' => $t->description, 'user' => $t->user?->name, 'created_at' => $t->created_at?->toIso8601String()]),
            'usage' => collect(range(5, 0))->map(fn ($i) => ['label' => now()->subMonths($i)->format('M Y'), 'credits' => (int) ($usage[now()->subMonths($i)->format('Y-m')] ?? 0)])->values(),
            'payment' => self::paymentSettings(),
            'methods' => array_map(fn ($m) => ['value' => $m, 'label' => ucwords(str_replace('_', ' ', $m))], self::PAYMENT_METHODS),
        ]);
    }

    public function order(Request $request): RedirectResponse
    {
        $data = $request->validate(['sms_package_id' => ['required', Rule::exists('sms_packages', 'id')->where('is_active', true)]]);
        $package = SmsPackage::findOrFail($data['sms_package_id']);
        $tenant = $this->tenancy()->tenant();

        $open = SmsOrder::where('tenant_id', $tenant->id)->where('status', 'pending')->count();
        if ($open >= 3) {
            $this->toast('You already have 3 unpaid orders. Pay or cancel one before ordering again.', 'error');

            return back();
        }

        $order = DB::transaction(function () use ($package, $tenant) {
            $order = SmsOrder::create([
                'tenant_id' => $tenant->id,
                'school_id' => $this->tenancy()->schoolId(),
                'sms_package_id' => $package->id,
                'reference' => 'SMS-'.uniqid(),
                'package_name' => $package->name,
                'credits' => $package->credits,
                'amount' => $package->price,
                'status' => 'pending',
                'requested_by' => auth()->id(),
            ]);
            $order->update(['reference' => 'SMS-'.now()->format('ymd').'-'.str_pad((string) $order->id, 4, '0', STR_PAD_LEFT)]);

            return $order;
        });

        $this->audit('sms_ordered', null, "Ordered SMS bundle {$order->reference}: {$order->package_name} ({$order->credits} SMS)", 'communication');
        $this->toast("Order {$order->reference} created. Pay using the instructions shown, then submit your payment reference.");

        Inertia::flash('sms_order', $order->id);

        return back();
    }

    /** School reports that it has paid; the platform verifies and credits the account. */
    public function submitPayment(Request $request, SmsOrder $order): RedirectResponse
    {
        $this->authorizeOrder($order);
        abort_unless($order->isOpen(), 422, 'This order is already closed.');

        $data = $request->validate([
            'payment_method' => ['required', Rule::in(self::PAYMENT_METHODS)],
            'payment_reference' => ['required', 'string', 'max:100'],
            'payer_phone' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [], ['payment_reference' => 'transaction / receipt number']);

        $order->update($data + ['status' => 'submitted', 'submitted_at' => now()]);
        $this->audit('sms_payment_submitted', null, "Submitted payment {$data['payment_reference']} for SMS order {$order->reference}", 'communication');

        Notification::send(User::where('is_super_admin', true)->get(), new SchoolNotification(
            'SMS payment to confirm',
            "{$order->tenant?->name}: {$order->reference} — {$order->credits} SMS, ref {$data['payment_reference']}",
            '/saas/sms?status=submitted',
            'info',
        ));

        $this->toast('Payment details sent. Credits are added as soon as the payment is confirmed.');

        return back();
    }

    public function cancel(SmsOrder $order): RedirectResponse
    {
        $this->authorizeOrder($order);
        abort_unless($order->status === 'pending', 422, 'Only unpaid orders can be cancelled.');

        $order->update(['status' => 'cancelled', 'cancel_reason' => 'Cancelled by the school']);
        $this->toast("Order {$order->reference} cancelled.");

        return back();
    }

    /** @return array{instructions: string, account_name: string|null} */
    public static function paymentSettings(): array
    {
        $s = (array) PlatformSetting::get('sms_payment', []);

        return [
            'instructions' => (string) ($s['instructions'] ?? 'Contact the platform administrator for payment details.'),
            'account_name' => $s['account_name'] ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function orderRow(SmsOrder $o): array
    {
        return [
            'id' => $o->id,
            'reference' => $o->reference,
            'package_name' => $o->package_name,
            'credits' => $o->credits,
            'amount' => (string) $o->amount,
            'status' => $o->status,
            'payment_method' => $o->payment_method,
            'payment_reference' => $o->payment_reference,
            'cancel_reason' => $o->cancel_reason,
            'school' => $o->school?->name,
            'requested_by' => $o->requester?->name,
            'created_at' => $o->created_at?->toIso8601String(),
            'paid_at' => $o->paid_at?->toIso8601String(),
        ];
    }

    private function authorizeOrder(SmsOrder $order): void
    {
        abort_unless($order->tenant_id === $this->tenancy()->tenantId(), 404);
    }
}
