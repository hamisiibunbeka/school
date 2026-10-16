<?php

namespace App\Http\Controllers\Boarding;

use App\Http\Controllers\Controller;
use App\Models\PocketMoneyAccount;
use App\Models\PocketMoneyCashCount;
use App\Models\PocketMoneyTransaction;
use App\Models\Student;
use App\Models\User;
use App\Services\Boarding\PocketMoneyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Boarders' pocket money kept by patrons/matrons: wallets, deposits,
 * on-demand withdrawals, statements, receipts and cash counts.
 */
class PocketMoneyController extends Controller
{
    public function __construct(private PocketMoneyService $service) {}

    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'custodian' => '', 'status' => ''], $request->only(['search', 'custodian', 'status']));

        $accounts = PocketMoneyAccount::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id,photo_path', 'student.schoolClass:id,name', 'student.stream:id,name', 'custodian:id,name'])
            ->withMax('transactions as last_activity', 'transacted_at')
            ->withSum(['transactions as withdrawn_today' => fn ($q) => $q->where('type', 'withdrawal')->whereNull('reversed_at')->whereDate('transacted_at', now()->toDateString())], 'amount')
            ->when($filters['custodian'], fn ($q, $c) => $q->where('custodian_id', $c))
            ->when($filters['status'] === 'closed', fn ($q) => $q->where('status', 'closed'), fn ($q) => $q->where('status', 'active'))
            ->when($filters['status'] === 'empty', fn ($q) => $q->where('balance', '<=', 0))
            ->when($filters['status'] === 'locked', fn ($q) => $q->where('failed_pin_attempts', '>=', PocketMoneyService::MAX_PIN_ATTEMPTS))
            ->when($filters['search'], fn ($q, $s) => $q->whereHas('student', fn ($st) => $st->search($s)))
            ->orderByDesc('last_activity')
            ->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (PocketMoneyAccount $a) => $this->accountRow($a));

        $today = now()->toDateString();
        $todayTotals = PocketMoneyTransaction::whereDate('transacted_at', $today)
            ->selectRaw("SUM(CASE WHEN type = 'deposit' AND reversed_at IS NULL THEN amount ELSE 0 END) as deposits")
            ->selectRaw("SUM(CASE WHEN type = 'withdrawal' AND reversed_at IS NULL THEN -amount ELSE 0 END) as withdrawals")
            ->selectRaw('COUNT(*) as count')
            ->first();

        return Inertia::render('boarding/pocket-money/index', [
            'accounts' => $accounts,
            'filters' => $filters,
            'stats' => [
                'held' => (string) PocketMoneyAccount::active()->sum('balance'),
                'my_custody' => (string) PocketMoneyAccount::active()->where('custodian_id', auth()->id())->sum('balance'),
                'wallets' => PocketMoneyAccount::active()->count(),
                'empty' => PocketMoneyAccount::active()->where('balance', '<=', 0)->count(),
                'deposits_today' => (string) ($todayTotals->deposits ?? 0),
                'withdrawals_today' => (string) ($todayTotals->withdrawals ?? 0),
                'transactions_today' => (int) $todayTotals->count,
            ],
            ...$this->formOptions(),
        ]);
    }

    public function show(Request $request, PocketMoneyAccount $account): Response
    {
        $from = $request->date('from') ?? now()->subDays(30)->startOfDay();
        $to = ($request->date('to') ?? now())->endOfDay();

        $opening = PocketMoneyTransaction::where('pocket_money_account_id', $account->id)
            ->where('transacted_at', '<', $from->copy()->startOfDay())
            ->orderByDesc('id')
            ->value('balance_after') ?? '0.00';

        $rows = PocketMoneyTransaction::where('pocket_money_account_id', $account->id)
            ->whereBetween('transacted_at', [$from->copy()->startOfDay(), $to])
            ->with('recorder:id,name')
            ->orderBy('id')
            ->get();

        $account->load(['student.schoolClass:id,name', 'student.stream:id,name', 'student.guardians:id,first_name,last_name,phone', 'custodian:id,name']);
        $guardian = $account->student->guardians->firstWhere('pivot.is_primary', true) ?? $account->student->guardians->first();
        $categories = PocketMoneyTransaction::where('pocket_money_account_id', $account->id)
            ->where('type', 'withdrawal')->whereNull('reversed_at')
            ->whereBetween('transacted_at', [$from->copy()->startOfDay(), $to])
            ->groupBy('category')
            ->selectRaw('category, SUM(-amount) as total, COUNT(*) as count')
            ->orderByDesc('total')
            ->get();

        return Inertia::render('boarding/pocket-money/show', [
            'account' => [
                ...$this->accountRow($account->loadMax('transactions as last_activity', 'transacted_at')),
                'notes' => $account->notes,
                'custodian_id' => $account->custodian_id,
                'guardian' => $guardian?->full_name,
                'guardian_phone' => $guardian?->phone,
                'opened_at' => $account->created_at?->toDateString(),
                'withdrawn_today' => $account->withdrawnToday(),
            ],
            'filters' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'opening' => (string) $opening,
            'transactions' => $rows->map(fn (PocketMoneyTransaction $t) => $this->transactionRow($t)),
            'totals' => [
                'in' => (string) $rows->where('amount', '>', 0)->sum('amount'),
                'out' => (string) -$rows->where('amount', '<', 0)->sum('amount'),
            ],
            'spending' => $categories,
            ...$this->formOptions(),
        ]);
    }

    public function transactions(Request $request): Response
    {
        $filters = array_merge(['from' => now()->toDateString(), 'to' => now()->toDateString(), 'type' => '', 'category' => '', 'recorded_by' => '', 'search' => ''], array_filter($request->only(['from', 'to', 'type', 'category', 'recorded_by', 'search']), fn ($v) => $v !== null));

        $base = PocketMoneyTransaction::query()
            ->when($filters['from'], fn ($q, $d) => $q->where('transacted_at', '>=', Carbon::parse($d)->startOfDay()))
            ->when($filters['to'], fn ($q, $d) => $q->where('transacted_at', '<=', Carbon::parse($d)->endOfDay()))
            ->when($filters['type'], fn ($q, $t) => $q->where('type', $t))
            ->when($filters['category'], fn ($q, $c) => $q->where('category', $c))
            ->when($filters['recorded_by'], fn ($q, $u) => $q->where('recorded_by', $u))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('reference', 'like', "%{$s}%")->orWhereHas('student', fn ($st) => $st->search($s))));

        $totals = (clone $base)
            ->selectRaw('COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as money_in')
            ->selectRaw('COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) as money_out')
            ->selectRaw('COUNT(*) as count')
            ->first();

        $transactions = (clone $base)
            ->with(['student:id,first_name,middle_name,last_name,admission_no,photo_path', 'recorder:id,name'])
            ->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (PocketMoneyTransaction $t) => $this->transactionRow($t) + [
                'student' => $t->student?->full_name,
                'admission_no' => $t->student?->admission_no,
                'photo_url' => $t->student?->photo_url,
                'account_id' => $t->pocket_money_account_id,
            ]);

        return Inertia::render('boarding/pocket-money/transactions', [
            'transactions' => $transactions,
            'filters' => $filters,
            'totals' => ['in' => (string) $totals->money_in, 'out' => (string) $totals->money_out, 'count' => (int) $totals->count],
            'recorders' => User::whereIn('id', PocketMoneyTransaction::query()->distinct()->pluck('recorded_by')->filter())->orderBy('name')->get(['id', 'name'])
                ->map(fn ($u) => ['value' => $u->id, 'label' => $u->name]),
            'categories' => $this->options(PocketMoneyTransaction::CATEGORIES),
        ]);
    }

    public function receipt(PocketMoneyTransaction $transaction): Response
    {
        $transaction->load(['student.schoolClass:id,name', 'student.stream:id,name', 'recorder:id,name', 'account.custodian:id,name', 'reversalOf:id,reference']);
        $s = $transaction->student;

        return Inertia::render('boarding/pocket-money/receipt', [
            'transaction' => $this->transactionRow($transaction) + [
                'student' => $s?->full_name,
                'admission_no' => $s?->admission_no,
                'class' => trim(($s?->schoolClass?->name ?? '').' '.($s?->stream?->name ?? '')),
                'account_id' => $transaction->pocket_money_account_id,
                'custodian' => $transaction->account?->custodian?->name,
                'reversal_of' => $transaction->reversalOf?->reference,
            ],
        ]);
    }

    public function cashCounts(): Response
    {
        $counts = PocketMoneyCashCount::query()
            ->with(['custodian:id,name', 'receiver:id,name', 'recorder:id,name'])
            ->orderByDesc('counted_at')
            ->paginate($this->perPage())
            ->through(fn (PocketMoneyCashCount $c) => [
                'id' => $c->id,
                'counted_at' => $c->counted_at?->format('Y-m-d H:i'),
                'custodian' => $c->custodian?->name,
                'accounts' => $c->accounts,
                'expected' => $c->expected,
                'counted' => $c->counted,
                'variance' => $c->variance,
                'handed_over_to' => $c->receiver?->name,
                'notes' => $c->notes,
                'recorded_by' => $c->recorder?->name,
            ]);

        return Inertia::render('boarding/pocket-money/cash-counts', [
            'counts' => $counts,
            'custodians' => $this->custodians(),
        ]);
    }

    public function deposit(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $this->tenancy()->schoolId())->where('residence_type', 'boarding')->whereNull('deleted_at')],
            'amount' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'method' => ['required', Rule::in(PocketMoneyTransaction::METHODS)],
            'counterparty' => ['required', 'string', 'max:120'],
            'counterparty_phone' => ['nullable', 'string', 'max:20'],
            'description' => ['nullable', 'string', 'max:255'],
            'notify' => ['boolean'],
        ], ['student_id.exists' => 'Pocket money is kept for boarding students only.', 'counterparty.required' => 'Record who handed over the money.']);

        $account = $this->service->accountFor(Student::findOrFail($data['student_id']));
        $txn = $this->service->deposit($account, $data);

        return $this->done($txn, 'Deposit recorded', ! empty($data['notify']));
    }

    public function withdraw(Request $request, PocketMoneyAccount $account): RedirectResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'category' => ['required', Rule::in(PocketMoneyTransaction::CATEGORIES)],
            'description' => [$request->input('category') === 'other' ? 'required' : 'nullable', 'string', 'max:255'],
            'counterparty' => ['nullable', 'string', 'max:120'],
            'pin' => [$account->hasPin() ? 'required' : 'nullable', 'string', 'max:12'],
            'limit_override_reason' => ['nullable', 'string', 'max:255'],
            'notify' => ['boolean'],
        ], ['pin.required' => 'The student must enter their PIN to confirm.', 'description.required' => 'Describe what the money is for.']);

        $txn = $this->service->withdraw($account, $data);

        return $this->done($txn, 'Withdrawal recorded', ! empty($data['notify']));
    }

    public function reverse(Request $request, PocketMoneyTransaction $transaction): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);
        $reversal = $this->service->reverse($transaction, $data['reason']);
        $this->toast("{$transaction->reference} reversed by {$reversal->reference}. Balance: ".number_format((float) $reversal->balance_after));

        return back();
    }

    public function update(Request $request, PocketMoneyAccount $account): RedirectResponse
    {
        $data = $request->validate([
            'daily_limit' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'custodian_id' => ['required', Rule::in($this->custodians()->pluck('value')->all())],
            'notes' => ['nullable', 'string', 'max:255'],
        ], ['custodian_id.in' => 'The custodian must be a staff member with boarding rights.']);
        $data['daily_limit'] = $data['daily_limit'] ?: null;

        $old = $account->only(array_keys($data));
        $account->update($data);
        $this->audit('updated', $account, "Pocket money wallet settings updated for {$account->student?->full_name}", 'boarding', $old, $data);
        $this->toast('Wallet settings saved.');

        return back();
    }

    public function pin(Request $request, PocketMoneyAccount $account): RedirectResponse
    {
        $data = $request->validate([
            'pin' => ['nullable', 'digits_between:4,6', 'confirmed'],
        ], ['pin.digits_between' => 'The PIN must be 4 to 6 digits.']);

        $this->service->setPin($account, $data['pin'] ?? null);
        $this->toast(! empty($data['pin']) ? 'PIN set. The student will be asked for it on every withdrawal.' : 'PIN removed.');

        return back();
    }

    public function close(Request $request, PocketMoneyAccount $account): RedirectResponse
    {
        $data = $request->validate([
            'counterparty' => [(float) $account->balance > 0 ? 'required' : 'nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
        ], ['counterparty.required' => 'Record who collected the remaining balance.']);

        $refund = $this->service->close($account, $data['counterparty'] ?? null, $data['description'] ?? null);
        $this->toast($refund ? "Wallet closed. Refund {$refund->reference} recorded." : 'Wallet closed.');

        return $refund ? to_route('boarding.pocket-money.receipt', $refund) : back();
    }

    public function reopen(PocketMoneyAccount $account): RedirectResponse
    {
        $this->service->reopen($account);
        $this->toast('Wallet reopened.');

        return back();
    }

    public function storeCashCount(Request $request): RedirectResponse
    {
        $custodians = $this->custodians()->pluck('value')->all();
        $data = $request->validate([
            'custodian_id' => ['required', Rule::in($custodians)],
            'counted' => ['required', 'numeric', 'min:0', 'max:1000000000'],
            'handed_over_to' => ['nullable', 'different:custodian_id', Rule::in($custodians)],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $count = $this->service->cashCount($data);
        $variance = (float) $count->variance;
        $this->toast(
            $variance == 0 ? 'Cash count recorded — cash matches the system.' : 'Cash count recorded with a variance of '.number_format($variance).'.',
            $variance == 0 ? 'success' : 'warning',
        );

        return back();
    }

    private function done(PocketMoneyTransaction $txn, string $label, bool $notify): RedirectResponse
    {
        $sms = $notify ? ($this->service->notifyGuardian($txn) ? ' Guardian notified by SMS.' : ' (Guardian SMS could not be sent.)') : '';
        $this->toast("{$label}: {$txn->reference}. New balance ".number_format((float) $txn->balance_after).'.'.$sms);
        Inertia::flash('pocket_money_receipt', $txn->id);

        return back();
    }

    /** @return array<string, mixed> */
    private function accountRow(PocketMoneyAccount $a): array
    {
        $s = $a->student;

        return [
            'id' => $a->id,
            'student_id' => $a->student_id,
            'student' => $s?->full_name,
            'admission_no' => $s?->admission_no,
            'photo_url' => $s?->photo_url,
            'class' => trim(($s?->schoolClass?->name ?? '').' '.($s?->stream?->name ?? '')),
            'custodian' => $a->custodian?->name,
            'balance' => $a->balance,
            'daily_limit' => $a->daily_limit,
            'withdrawn_today' => isset($a->withdrawn_today) ? (string) -$a->withdrawn_today : null,
            'has_pin' => $a->hasPin(),
            'pin_locked' => $a->failed_pin_attempts >= PocketMoneyService::MAX_PIN_ATTEMPTS,
            'status' => $a->status,
            'last_activity' => $a->last_activity ? Carbon::parse($a->last_activity)->format('Y-m-d H:i') : null,
        ];
    }

    /** @return array<string, mixed> */
    private function transactionRow(PocketMoneyTransaction $t): array
    {
        return [
            'id' => $t->id,
            'reference' => $t->reference,
            'type' => $t->type,
            'amount' => $t->amount,
            'balance_after' => $t->balance_after,
            'transacted_at' => $t->transacted_at?->format('Y-m-d H:i'),
            'method' => $t->method,
            'counterparty' => $t->counterparty,
            'counterparty_phone' => $t->counterparty_phone,
            'category' => $t->category,
            'description' => $t->description,
            'pin_verified' => $t->pin_verified,
            'limit_override_reason' => $t->limit_override_reason,
            'recorded_by' => $t->recorder?->name,
            'reversed' => $t->reversed_at !== null,
            'reversible' => $t->isReversible(),
        ];
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        $balances = PocketMoneyAccount::query()->get(['student_id', 'balance', 'status'])->keyBy('student_id');

        return [
            'students' => Student::active()->where('residence_type', 'boarding')->orderBy('first_name')
                ->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no'])
                ->map(fn ($s) => [
                    'value' => $s->id,
                    'label' => "{$s->full_name} ({$s->admission_no})",
                    'balance' => $balances[$s->id]->balance ?? null,
                    'closed' => ($balances[$s->id]->status ?? null) === 'closed',
                ]),
            'custodians' => $this->custodians(),
            'categories' => $this->options(PocketMoneyTransaction::CATEGORIES),
            'methods' => $this->options(PocketMoneyTransaction::METHODS),
        ];
    }

    /** Staff who may hold boarders' cash, with what each is expected to hold. */
    private function custodians(): Collection
    {
        $held = PocketMoneyAccount::active()->groupBy('custodian_id')
            ->select('custodian_id', DB::raw('SUM(balance) as total'), DB::raw('COUNT(*) as wallets'))
            ->get()->keyBy('custodian_id');

        return User::where('school_id', $this->tenancy()->schoolId())
            ->where('status', 'active')
            ->with('role')
            ->orderBy('name')
            ->get()
            ->filter(fn (User $u) => $u->hasPermission('boarding.manage') || $held->has($u->id))
            ->map(fn (User $u) => [
                'value' => $u->id,
                'label' => $u->name,
                'held' => (string) ($held[$u->id]->total ?? '0.00'),
                'wallets' => (int) ($held[$u->id]->wallets ?? 0),
            ])
            ->values();
    }

    /** @param  array<int, string>  $values */
    private function options(array $values): array
    {
        return array_map(fn ($v) => ['value' => $v, 'label' => ucwords(str_replace('_', ' ', $v))], $values);
    }
}
