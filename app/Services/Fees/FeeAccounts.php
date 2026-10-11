<?php

namespace App\Services\Fees;

use App\Models\Account;
use App\Support\Tenancy;
use Illuminate\Validation\ValidationException;

/**
 * Resolves the ledger accounts used by fee billing and receipting
 * (cached per school for the life of the request / seeder run).
 */
class FeeAccounts
{
    /** @var array<string, int> */
    protected array $cache = [];

    public function idForCode(string $code, ?string $fallbackSubType = null): int
    {
        $key = app(Tenancy::class)->schoolId().':'.$code;

        if (! isset($this->cache[$key])) {
            $account = Account::where('code', $code)->where('is_postable', true)->first()
                ?? ($fallbackSubType ? Account::bySubType($fallbackSubType) : null);

            if (! $account) {
                throw ValidationException::withMessages([
                    'account' => "Ledger account {$code} is missing from the chart of accounts. Set it up under Accounting first.",
                ]);
            }

            $this->cache[$key] = $account->id;
        }

        return $this->cache[$key];
    }

    /** 1300 Student Fees Receivable (control account). */
    public function receivable(): int
    {
        return $this->idForCode('1300', 'receivable');
    }

    /** 4100 Tuition — default income account when a category has none. */
    public function defaultIncome(): int
    {
        return $this->idForCode('4100');
    }

    /** Default deposit account for a payment method (cash 1100, bank 1210, mobile 1250, cheque/card 1200). */
    public function depositFor(string $method): int
    {
        $code = \App\Models\Payment::DEFAULT_ACCOUNTS[$method] ?? '1100';
        $subType = match ($method) {
            'cash' => 'cash',
            'mobile_money' => 'mobile_money',
            default => 'bank',
        };

        return $this->idForCode($code, $subType);
    }
}
