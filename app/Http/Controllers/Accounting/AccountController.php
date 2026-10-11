<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Models\JournalLine;
use App\Services\Accounting\FinancialStatements;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Chart of Accounts (SRS 5.1 / 5.2). */
class AccountController extends AccountingController
{
    /** Known sub-types per account class (drives statement classification). */
    public const SUB_TYPES = [
        'asset' => ['header', 'cash', 'bank', 'mobile_money', 'receivable', 'current_asset', 'inventory', 'prepaid', 'fixed_asset', 'contra_asset', 'non_current_asset', 'investment'],
        'liability' => ['header', 'payable', 'current_liability', 'deferred_income', 'statutory', 'salaries_payable', 'long_term_liability'],
        'equity' => ['header', 'capital', 'retained_earnings', 'reserve', 'opening_balance'],
        'income' => ['header', 'fee_income', 'sales', 'other_income'],
        'expense' => ['header', 'direct_cost', 'cost_of_sales', 'payroll_expense', 'operating_expense', 'other_expense'],
    ];

    public function index(FinancialStatements $statements): Response
    {
        $accounts = $statements->accounts();
        $balances = $statements->accountBalances();
        $posted = JournalLine::query()->selectRaw('account_id, COUNT(*) as c')->groupBy('account_id')->pluck('c', 'account_id');

        $rows = $this->flatten($accounts, $balances, $posted);

        $totals = [];
        foreach (Account::TYPES as $type) {
            $totals[$type] = $accounts->filter(fn ($a) => $a->type === $type && ! $a->parent_id)
                ->reduce(fn ($c, $a) => bcadd($c, $balances[$a->id] ?? '0', 2), '0.00');
        }

        return Inertia::render('accounting/accounts/index', [
            'accounts' => $rows,
            'totals' => $totals,
            'stats' => [
                'total' => $accounts->count(),
                'postable' => $accounts->where('is_postable', true)->count(),
                'control' => $accounts->where('is_control', true)->count(),
                'inactive' => $accounts->where('is_active', false)->count(),
            ],
            'subTypes' => self::SUB_TYPES,
            'parents' => $accounts->map(fn ($a) => ['value' => $a->id, 'label' => "{$a->code} · {$a->name}", 'type' => $a->type])->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $account = Account::create($data);

        $this->audit('created', $account, "Account {$account->code} {$account->name} created", 'accounting', null, $data);
        $this->toast("Account {$account->code} created.");

        return back();
    }

    public function update(Request $request, Account $account): RedirectResponse
    {
        $data = $this->validated($request, $account);

        if ($account->lines()->exists() && ($data['type'] !== $account->type || $data['normal_balance'] !== $account->normal_balance)) {
            throw ValidationException::withMessages(['type' => 'This account has postings; its class and normal balance cannot be changed.']);
        }
        if ($account->lines()->exists() && ! $data['is_postable']) {
            throw ValidationException::withMessages(['is_postable' => 'This account has postings and must remain postable.']);
        }

        $old = $account->only(array_keys($data));
        $account->update($data);

        $this->audit('updated', $account, "Account {$account->code} updated", 'accounting', $old, $data);
        $this->toast('Account updated.');

        return back();
    }

    public function destroy(Account $account): RedirectResponse
    {
        if ($account->lines()->exists()) {
            $this->toast('This account has journal postings and cannot be deleted — deactivate it instead.', 'error');

            return back();
        }
        if ($account->children()->exists()) {
            $this->toast('Move or delete the sub-accounts first.', 'error');

            return back();
        }

        try {
            $account->delete();
        } catch (QueryException) {
            $this->toast('This account is referenced elsewhere (fees, payroll, budgets or vouchers) — deactivate it instead.', 'error');

            return back();
        }

        $this->audit('deleted', $account, "Account {$account->code} {$account->name} deleted", 'accounting');
        $this->toast('Account deleted.');

        return back();
    }

    public function toggle(Account $account): RedirectResponse
    {
        $account->update(['is_active' => ! $account->is_active]);
        $state = $account->is_active ? 'activated' : 'deactivated';

        $this->audit($state, $account, "Account {$account->code} {$state}", 'accounting');
        $this->toast("Account {$account->code} {$state}.");

        return back();
    }

    /**
     * Depth-first flatten of the account tree.
     *
     * @param  Collection<int, Account>  $accounts
     * @param  array<int, string>  $balances
     * @param  Collection<int, int>  $posted
     * @return array<int, array<string, mixed>>
     */
    private function flatten(Collection $accounts, array $balances, Collection $posted): array
    {
        $children = $accounts->groupBy(fn ($a) => $a->parent_id ?? 0);
        $rows = [];
        $order = array_flip(Account::TYPES);

        $walk = function ($parentId, int $depth) use (&$walk, &$rows, $children, $balances, $posted, $order) {
            $list = $children->get($parentId, collect())->sortBy(fn ($a) => [$order[$a->type] ?? 9, $a->code]);
            foreach ($list as $a) {
                $rows[] = [
                    'id' => $a->id,
                    'parent_id' => $a->parent_id,
                    'code' => $a->code,
                    'name' => $a->name,
                    'type' => $a->type,
                    'sub_type' => $a->sub_type,
                    'normal_balance' => $a->normal_balance,
                    'is_control' => $a->is_control,
                    'is_postable' => $a->is_postable,
                    'is_active' => $a->is_active,
                    'description' => $a->description,
                    'depth' => $depth,
                    'balance' => $balances[$a->id] ?? '0.00',
                    'postings' => (int) ($posted[$a->id] ?? 0),
                    'children' => $children->get($a->id, collect())->count(),
                ];
                $walk($a->id, $depth + 1);
            }
        };
        $walk(0, 0);

        return $rows;
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Account $account = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:20', 'regex:/^[A-Za-z0-9.\-]+$/', Rule::unique('accounts', 'code')->where('school_id', $schoolId)->ignore($account?->id)],
            'name' => ['required', 'string', 'max:150'],
            'type' => ['required', Rule::in(Account::TYPES)],
            'sub_type' => ['nullable', 'string', 'max:50'],
            'parent_id' => ['nullable', Rule::exists('accounts', 'id')->where('school_id', $schoolId)],
            'normal_balance' => ['nullable', Rule::in(['debit', 'credit'])],
            'is_control' => ['boolean'],
            'is_postable' => ['boolean'],
            'is_active' => ['boolean'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $data['normal_balance'] ??= in_array($data['type'], ['asset', 'expense'], true) ? 'debit' : 'credit';
        $data['is_control'] = (bool) ($data['is_control'] ?? false);
        $data['is_postable'] = (bool) ($data['is_postable'] ?? true);
        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        if (! empty($data['parent_id'])) {
            $parent = Account::find($data['parent_id']);
            if ($parent->type !== $data['type']) {
                throw ValidationException::withMessages(['parent_id' => 'The parent account must be of the same class.']);
            }
            if ($account && $this->isSelfOrDescendant($account, $parent)) {
                throw ValidationException::withMessages(['parent_id' => 'An account cannot be placed under itself or one of its sub-accounts.']);
            }
            if ($parent->lines()->exists()) {
                throw ValidationException::withMessages(['parent_id' => 'The chosen parent has postings; choose a header (non-postable) account.']);
            }
        }

        return $data;
    }

    private function isSelfOrDescendant(Account $account, Account $candidate): bool
    {
        $node = $candidate;
        $guard = 0;
        while ($node && $guard++ < 50) {
            if ($node->id === $account->id) {
                return true;
            }
            $node = $node->parent_id ? Account::find($node->parent_id) : null;
        }

        return false;
    }
}
