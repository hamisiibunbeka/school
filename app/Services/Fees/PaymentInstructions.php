<?php

namespace App\Services\Fees;

use App\Models\Account;
use App\Support\Tenancy;

/**
 * Payment instructions printed on invoices and statements.
 *
 * Schools can override them in settings (`fees.bank_accounts` = [{bank, account_name, account_no}],
 * `fees.mobile_money` = [{provider, number, name}], `fees.payment_note`); otherwise sensible
 * defaults are built from the bank accounts in the chart of accounts.
 */
class PaymentInstructions
{
    /** @return array{banks: array<int, array{bank:string, account_name:string, account_no:?string}>, mobile: array<int, array{provider:string, number:?string, name:string}>, note:string} */
    public static function forCurrentSchool(): array
    {
        $school = app(Tenancy::class)->school();
        $name = $school?->name ?? 'The School';

        $banks = $school?->setting('fees.bank_accounts');
        // Fall back to the single bank account captured in Administration > School Settings.
        if ((! is_array($banks) || ! $banks) && $school?->setting('bank_name')) {
            $banks = [[
                'bank' => (string) $school->setting('bank_name'),
                'account_name' => (string) ($school->setting('bank_account_name') ?: $name),
                'account_no' => $school->setting('bank_account_no'),
            ]];
        }
        if (! is_array($banks) || ! $banks) {
            $banks = Account::postable()->where('sub_type', 'bank')->orderBy('code')->get(['name'])
                ->map(fn ($a) => ['bank' => trim(preg_replace('/\b(Fees Collection|Account)\b/i', '', $a->name)), 'account_name' => $name, 'account_no' => null])
                ->all();
        }

        $mobile = $school?->setting('fees.mobile_money');
        if ((! is_array($mobile) || ! $mobile) && $school?->setting('mobile_money_paybill')) {
            $mobile = [[
                'provider' => (string) ($school->setting('mobile_money_provider') ?: 'Mobile money'),
                'number' => trim($school->setting('mobile_money_paybill').' '.($school->setting('mobile_money_account') ? '(Acc: '.$school->setting('mobile_money_account').')' : '')),
                'name' => $name,
            ]];
        }
        if (! is_array($mobile) || ! $mobile) {
            $mobile = [
                ['provider' => 'M-Pesa / Mixx by Yas / Airtel Money (Lipa Namba)', 'number' => $school?->phone, 'name' => $name],
            ];
        }

        return [
            'banks' => array_values($banks),
            'mobile' => array_values($mobile),
            'note' => (string) ($school?->setting('fees.payment_note') ?? $school?->setting('payment_instructions') ??'Always quote the student\'s admission number as the payment reference and keep your official receipt. Cash is accepted only at the bursar\'s office against an official receipt.'),
        ];
    }
}
