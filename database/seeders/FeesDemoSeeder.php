<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\FeeCategory;
use App\Models\FeeDiscount;
use App\Models\FeeStructure;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Term;
use App\Models\User;
use App\Services\Fees\BillingService;
use App\Services\Fees\PaymentService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

/**
 * Demo fees data for the current school (runs inside the demo school's tenancy context).
 *
 * Everything goes through BillingService / PaymentService so every invoice and receipt
 * is posted to the general ledger exactly as in production.
 */
class FeesDemoSeeder extends Seeder
{
    /** @var array<string, bool> */
    private array $usedRefs = [];

    private BillingService $billing;

    private PaymentService $payments;

    public function run(): void
    {
        mt_srand(2026);

        if (Invoice::exists()) {
            $this->command?->warn('Fees demo data already present — skipped.');

            return;
        }

        $this->billing = app(BillingService::class);
        $this->payments = app(PaymentService::class);

        $terms = Term::whereHas('academicYear', fn ($q) => $q->where('is_current', true))->orderBy('start_date')->get();
        if ($terms->count() < 2) {
            $terms = Term::orderBy('start_date')->get()->take(-2)->values();
        }
        [$termOne, $termTwo] = [$terms[0], $terms[1]];

        // Post as the bursar so created_by / received_by / approved_by are realistic.
        $bursar = User::where('email', 'bursar@mzenzi.test')->first() ?? User::where('school_id', app(\App\Support\Tenancy::class)->schoolId())->first();
        if ($bursar) {
            auth()->setUser($bursar);
        }

        $this->structures($termOne, '2026-01-31');
        $this->structures($termTwo, '2026-07-31');
        $this->discounts($bursar);

        $classIds = SchoolClass::pluck('id')->all();
        $students = Student::active()->with('guardians')->get()->keyBy('id');

        // ---------- Term I: issue, then ~90% settle in full ----------
        $this->billing->generate($termOne, $classIds, '2026-01-08', null, 'Term I fees');
        $termOneInvoices = Invoice::where('term_id', $termOne->id)->get();
        foreach ($termOneInvoices as $invoice) {
            $student = $students[$invoice->student_id] ?? null;
            if (! $student) {
                continue;
            }
            $roll = mt_rand(1, 100);
            $total = (int) round((float) $invoice->total);
            $target = match (true) {
                $roll <= 3 => $total + mt_rand(1, 3) * 50000,          // a few overpay -> credit carried to Term II
                $roll <= 90 => $total,                                   // fully paid
                $roll <= 97 => $this->round($total * mt_rand(45, 85) / 100), // partial
                default => 0,                                            // nothing paid
            };
            $this->payInInstalments($student, $target, '2026-01-04', '2026-05-29');
        }

        // ---------- Term II: issue (credits auto-apply), ~55% collected so far ----------
        $this->billing->generate($termTwo, $classIds, '2026-07-01', null, 'Term II fees');
        $termTwoInvoices = Invoice::where('term_id', $termTwo->id)->get();
        foreach ($termTwoInvoices as $invoice) {
            $student = $students[$invoice->student_id] ?? null;
            if (! $student) {
                continue;
            }
            $roll = mt_rand(1, 100);
            $due = (int) round((float) $invoice->fresh()->balance);
            $target = match (true) {
                $roll <= 33 => $due,                                           // cleared
                $roll <= 78 => $this->round($due * mt_rand(30, 75) / 100),     // partial
                default => 0,                                                  // nothing yet
            };
            $this->payInInstalments($student, $target, '2026-07-02', '2026-10-08');
        }

        // ---------- A couple of voided receipts (controlled reversal) ----------
        $voidable = $students->values()->slice(5, 2)->values();
        $reasons = ['Duplicate entry — the same bank slip was captured twice.', 'Cheque returned unpaid by the bank (insufficient funds).'];
        foreach ($voidable as $i => $student) {
            $method = $i === 0 ? 'bank' : 'cheque';
            $payment = $this->payments->receive([
                'student_id' => $student->id,
                'amount' => (string) (mt_rand(2, 6) * 50000),
                'method' => $method,
                'reference' => $this->reference($method, '2026-09-1'.($i + 2)),
                'payer_name' => $this->payer($student),
                'payment_date' => '2026-09-1'.($i + 2),
                'notes' => 'Captured at the bursar\'s office',
            ], audit: false);
            $this->payments->void($payment, $reasons[$i], '2026-09-1'.($i + 4));
        }

        auth()->forgetUser();

        $this->command?->info(sprintf('Fees demo: %d invoices, %d receipts.', Invoice::count(), Payment::count()));
    }

    private function structures(Term $term, string $due): void
    {
        if (FeeStructure::where('term_id', $term->id)->exists()) {
            return;
        }

        $cats = FeeCategory::pluck('id', 'code');
        $tuition = [1 => 750000, 2 => 800000, 3 => 850000, 4 => 950000];

        foreach (SchoolClass::orderBy('level')->get() as $class) {
            $lines = [
                ['TUI', 'all', $tuition[$class->level] ?? 850000],
                ['BRD', 'boarding', 600000],
                ['EXM', 'all', 50000],
                ['MEL', 'day', 150000],
            ];
            foreach ($lines as [$code, $residence, $amount]) {
                if (! isset($cats[$code])) {
                    continue;
                }
                FeeStructure::create([
                    'academic_year_id' => $term->academic_year_id,
                    'term_id' => $term->id,
                    'school_class_id' => $class->id,
                    'fee_category_id' => $cats[$code],
                    'residence_type' => $residence,
                    'amount' => $amount,
                    'due_date' => $due,
                ]);
            }
        }
    }

    private function discounts(?User $approver): void
    {
        $tuitionId = FeeCategory::where('code', 'TUI')->value('id');
        $students = Student::active()->orderBy('id')->get();

        // Sibling discount: families sharing a guardian (e.g. the demo parent's two children).
        $siblings = \Illuminate\Support\Facades\DB::table('guardian_student')
            ->whereIn('student_id', $students->pluck('id'))
            ->select('guardian_id')->groupBy('guardian_id')->havingRaw('COUNT(*) > 1')->pluck('guardian_id');
        $siblingIds = \Illuminate\Support\Facades\DB::table('guardian_student')->whereIn('guardian_id', $siblings)->pluck('student_id')->unique();
        // Plus a few more families flagged by the bursar.
        $siblingIds = $siblingIds->merge($this->sample($students->slice(20)->values(), 6)->pluck('id'))->unique();

        foreach ($siblingIds as $id) {
            FeeDiscount::create([
                'student_id' => $id, 'fee_category_id' => $tuitionId, 'name' => 'Sibling discount', 'type' => 'percent', 'value' => 10,
                'reason' => 'Two or more children enrolled at the school', 'is_active' => true, 'approved_by' => $approver?->id,
            ]);
        }

        $pool = $students->whereNotIn('id', $siblingIds->all())->values();
        $scholars = $this->sample($pool, 4);
        foreach ($scholars as $s) {
            FeeDiscount::create([
                'student_id' => $s->id, 'fee_category_id' => $tuitionId, 'name' => 'Academic excellence scholarship', 'type' => 'percent', 'value' => 50,
                'reason' => 'Top performer in the national examinations', 'is_active' => true, 'approved_by' => $approver?->id,
            ]);
        }

        $rest = $pool->whereNotIn('id', $scholars->pluck('id')->all())->values();
        foreach ($this->sample($rest, 2) as $s) {
            FeeDiscount::create([
                'student_id' => $s->id, 'fee_category_id' => null, 'name' => 'Staff child bursary', 'type' => 'fixed', 'value' => 200000,
                'reason' => 'Child of a member of staff (board resolution)', 'is_active' => true, 'approved_by' => $approver?->id,
            ]);
        }
    }

    /** Record a target amount as 1–3 receipts on dates inside the window. */
    private function payInInstalments(Student $student, int $target, string $from, string $to): void
    {
        if ($target <= 0) {
            return;
        }

        $parts = $target >= 600000 ? mt_rand(1, 3) : 1;
        $amounts = [];
        $left = $target;
        for ($i = 1; $i < $parts; $i++) {
            $chunk = $this->round($left * mt_rand(35, 60) / 100);
            if ($chunk <= 0 || $chunk >= $left) {
                break;
            }
            $amounts[] = $chunk;
            $left -= $chunk;
        }
        $amounts[] = $left;

        $start = strtotime($from);
        $span = (int) ((strtotime($to) - $start) / 86400);
        $dates = [];
        foreach ($amounts as $i => $a) {
            // Earlier instalments skew to the start of term.
            $offset = (int) ($span * (($i + mt_rand(0, 100) / 100) / count($amounts)));
            $dates[] = date('Y-m-d', $start + min($span, max(0, $offset)) * 86400);
        }
        sort($dates);

        foreach ($amounts as $i => $amount) {
            $roll = mt_rand(1, 100);
            $method = $roll <= 45 ? 'mobile_money' : ($roll <= 85 ? 'bank' : 'cash');
            $deposit = null;
            if ($method === 'bank') {
                $deposit = Account::where('code', mt_rand(1, 100) <= 70 ? '1210' : '1200')->value('id');
            }

            $this->payments->receive([
                'student_id' => $student->id,
                'amount' => (string) $amount,
                'method' => $method,
                'reference' => $this->reference($method, $dates[$i]),
                'payer_name' => $this->payer($student),
                'deposit_account_id' => $deposit,
                'payment_date' => $dates[$i],
            ], audit: false);
        }
    }

    private function reference(string $method, string $date): ?string
    {
        if ($method === 'cash') {
            return null;
        }

        do {
            $ref = match ($method) {
                'mobile_money' => $this->pick(['S', 'T', 'Q', 'R']).$this->token(9),
                'cheque' => 'CHQ'.mt_rand(100000, 999999),
                default => 'FT'.date('ymd', strtotime($date)).mt_rand(10000, 99999),
            };
        } while (isset($this->usedRefs[$method.$ref]));

        $this->usedRefs[$method.$ref] = true;

        return $ref;
    }

    private function payer(Student $student): ?string
    {
        /** @var Collection<int, \App\Models\Guardian> $guardians */
        $guardians = $student->guardians;
        $g = $guardians->firstWhere('pivot.is_primary', true) ?? $guardians->first();

        return $g?->full_name;
    }

    private function round(float|int $amount): int
    {
        return (int) (round($amount / 5000) * 5000);
    }

    /** Deterministic random sample (mt_rand-based, so the seed is honoured). */
    private function sample(Collection $items, int $n): Collection
    {
        $items = $items->values()->all();
        for ($i = count($items) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$items[$i], $items[$j]] = [$items[$j], $items[$i]];
        }

        return collect(array_slice($items, 0, $n));
    }

    private function token(int $length): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $chars[mt_rand(0, strlen($chars) - 1)];
        }

        return $out;
    }

    /** @param  array<int, string>  $items */
    private function pick(array $items): string
    {
        return $items[mt_rand(0, count($items) - 1)];
    }
}
