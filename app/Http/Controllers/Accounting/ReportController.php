<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Services\Accounting\FinancialStatements;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Ledger and financial statements (SRS 5.4). All maths lives in FinancialStatements. */
class ReportController extends AccountingController
{
    public function __construct(protected FinancialStatements $statements) {}

    public function ledger(Request $request): Response
    {
        $from = $this->dateParam($request, 'from', $this->fiscalYearStart());
        $to = $this->dateParam($request, 'to', now()->toDateString());
        $accountId = (int) $request->query('account', 0);

        $account = $accountId ? Account::find($accountId) : (Account::byCode('1200') ?? Account::postable()->orderBy('code')->first());

        return Inertia::render('accounting/ledger', [
            'filters' => ['account' => $account ? (string) $account->id : '', 'from' => $from, 'to' => $to],
            'account' => $account ? [
                'id' => $account->id, 'code' => $account->code, 'name' => $account->name, 'type' => $account->type,
                'sub_type' => $account->sub_type, 'normal_balance' => $account->normal_balance, 'is_control' => $account->is_control,
            ] : null,
            'ledger' => $account ? $this->statements->ledger($account, $from, $to) : null,
            'accounts' => Account::orderBy('code')->where('is_postable', true)->get(['id', 'code', 'name'])
                ->map(fn ($a) => ['value' => $a->id, 'label' => "{$a->code} · {$a->name}"]),
            'meta' => $this->reportMeta(),
        ]);
    }

    public function trialBalance(Request $request): Response
    {
        $mode = $request->query('mode') === 'period' ? 'period' : 'as_at';
        $to = $this->dateParam($request, 'to', now()->toDateString());
        $from = $mode === 'period' ? $this->dateParam($request, 'from', $this->fiscalYearStart($to)) : null;
        $compare = $request->boolean('compare');

        $cmpTo = $cmpFrom = null;
        if ($compare) {
            $cmpTo = $this->dateParam($request, 'cmp_to', CarbonImmutable::parse($to)->subYear()->toDateString());
            $cmpFrom = $mode === 'period' ? $this->dateParam($request, 'cmp_from', CarbonImmutable::parse($from)->subYear()->toDateString()) : null;
        }

        return Inertia::render('accounting/trial-balance', [
            'filters' => ['mode' => $mode, 'from' => $from ?? '', 'to' => $to, 'compare' => $compare ? '1' : '', 'cmp_from' => $cmpFrom ?? '', 'cmp_to' => $cmpTo ?? ''],
            'report' => $this->statements->trialBalance($to, $from, $cmpTo, $cmpFrom),
            'meta' => $this->reportMeta(),
        ]);
    }

    public function incomeStatement(Request $request): Response
    {
        $from = $this->dateParam($request, 'from', $this->fiscalYearStart());
        $to = $this->dateParam($request, 'to', now()->toDateString());
        $compare = $request->boolean('compare');
        $cmpFrom = $compare ? $this->dateParam($request, 'cmp_from', CarbonImmutable::parse($from)->subYear()->toDateString()) : null;
        $cmpTo = $compare ? $this->dateParam($request, 'cmp_to', CarbonImmutable::parse($to)->subYear()->toDateString()) : null;

        return Inertia::render('accounting/income-statement', [
            'filters' => ['from' => $from, 'to' => $to, 'compare' => $compare ? '1' : '', 'cmp_from' => $cmpFrom ?? '', 'cmp_to' => $cmpTo ?? ''],
            'report' => $this->statements->incomeStatement($from, $to),
            'comparative' => $compare ? $this->statements->incomeStatement($cmpFrom, $cmpTo) : null,
            'meta' => $this->reportMeta(),
        ]);
    }

    public function balanceSheet(Request $request): Response
    {
        $asAt = $this->dateParam($request, 'as_at', now()->toDateString());
        $compare = $request->boolean('compare');
        $cmpAt = $compare ? $this->dateParam($request, 'cmp_at', CarbonImmutable::parse($asAt)->subYear()->toDateString()) : null;

        return Inertia::render('accounting/balance-sheet', [
            'filters' => ['as_at' => $asAt, 'compare' => $compare ? '1' : '', 'cmp_at' => $cmpAt ?? ''],
            'report' => $this->statements->balanceSheet($asAt),
            'comparative' => $cmpAt ? $this->statements->balanceSheet($cmpAt) : null,
            'meta' => $this->reportMeta(),
        ]);
    }

    public function cashFlow(Request $request): Response
    {
        $from = $this->dateParam($request, 'from', $this->fiscalYearStart());
        $to = $this->dateParam($request, 'to', now()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return Inertia::render('accounting/cash-flow', [
            'filters' => ['from' => $from, 'to' => $to],
            'report' => $this->statements->cashFlow($from, $to),
            'meta' => $this->reportMeta(),
        ]);
    }
}
