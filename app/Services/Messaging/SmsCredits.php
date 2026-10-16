<?php

namespace App\Services\Messaging;

use App\Models\SmsCreditTransaction;
use App\Models\SmsOrder;
use App\Models\Tenant;
use Illuminate\Support\Facades\DB;

/**
 * Per-account (tenant) SMS wallet.
 *
 * Two buckets: the plan's monthly allowance (resets each month, does not
 * roll over) and purchased bundle credits (never expire). Sending spends the
 * allowance first. Every SMS is charged before it goes to the provider and
 * refunded if the provider rejects it, so the balance can never go negative.
 */
class SmsCredits
{
    /** @return array{plan: int, purchased: int, total: int, plan_limit: int} */
    public function balance(Tenant|int|null $tenant): array
    {
        $tenant = $this->tenant($tenant);
        if (! $tenant) {
            return ['plan' => 0, 'purchased' => 0, 'total' => 0, 'plan_limit' => 0];
        }

        if ($tenant->sms_plan_period !== now()->format('Y-m')) {
            $tenant = DB::transaction(fn () => $this->refreshAllowance(Tenant::lockForUpdate()->find($tenant->id)));
        }

        return [
            'plan' => (int) $tenant->sms_plan_balance,
            'purchased' => (int) $tenant->sms_balance,
            'total' => (int) $tenant->sms_plan_balance + (int) $tenant->sms_balance,
            'plan_limit' => (int) ($tenant->plan?->sms_credits ?? 0),
        ];
    }

    /**
     * Take credits for one message. Returns how much came from each bucket,
     * or null when the balance is insufficient (nothing is taken).
     *
     * @return array{plan: int, purchased: int}|null
     */
    public function consume(int $tenantId, int $credits): ?array
    {
        if ($credits <= 0) {
            return ['plan' => 0, 'purchased' => 0];
        }

        return DB::transaction(function () use ($tenantId, $credits) {
            $tenant = $this->refreshAllowance(Tenant::lockForUpdate()->find($tenantId));
            if (! $tenant || $tenant->sms_plan_balance + $tenant->sms_balance < $credits) {
                return null;
            }

            $fromPlan = min($credits, (int) $tenant->sms_plan_balance);
            $split = ['plan' => $fromPlan, 'purchased' => $credits - $fromPlan];
            $tenant->forceFill([
                'sms_plan_balance' => $tenant->sms_plan_balance - $split['plan'],
                'sms_balance' => $tenant->sms_balance - $split['purchased'],
            ])->save();

            return $split;
        });
    }

    /** @param  array{plan: int, purchased: int}  $split */
    public function refund(int $tenantId, array $split): void
    {
        if ($split['plan'] + $split['purchased'] <= 0) {
            return;
        }

        DB::transaction(function () use ($tenantId, $split) {
            $tenant = Tenant::lockForUpdate()->find($tenantId);
            if (! $tenant) {
                return;
            }
            // Allowance taken in an earlier month has expired; only refund it within the same month.
            $plan = $tenant->sms_plan_period === now()->format('Y-m') ? $split['plan'] : 0;
            $tenant->forceFill([
                'sms_plan_balance' => $tenant->sms_plan_balance + $plan,
                'sms_balance' => $tenant->sms_balance + $split['purchased'],
            ])->save();
        });
    }

    /** Add (or with negative credits remove) purchased credits and record it in the ledger. */
    public function credit(Tenant $tenant, int $credits, string $type, string $description, ?SmsOrder $order = null): SmsCreditTransaction
    {
        return DB::transaction(function () use ($tenant, $credits, $type, $description, $order) {
            $tenant = Tenant::lockForUpdate()->findOrFail($tenant->id);
            $balance = max(0, (int) $tenant->sms_balance + $credits);
            $tenant->forceFill(['sms_balance' => $balance])->save();

            return SmsCreditTransaction::create([
                'tenant_id' => $tenant->id,
                'type' => $type,
                'credits' => $credits,
                'balance_after' => $balance,
                'description' => $description,
                'sms_order_id' => $order?->id,
                'user_id' => auth()->id(),
            ]);
        });
    }

    /** Reset the monthly plan allowance when a new month starts (caller holds the row lock). */
    private function refreshAllowance(?Tenant $tenant): ?Tenant
    {
        $period = now()->format('Y-m');
        if (! $tenant || $tenant->sms_plan_period === $period) {
            return $tenant;
        }

        $allowance = (int) ($tenant->plan?->sms_credits ?? 0);
        $tenant->forceFill(['sms_plan_balance' => $allowance, 'sms_plan_period' => $period])->save();

        if ($allowance > 0) {
            SmsCreditTransaction::create([
                'tenant_id' => $tenant->id,
                'type' => 'allowance',
                'credits' => $allowance,
                'balance_after' => (int) $tenant->sms_balance,
                'description' => 'Monthly plan allowance for '.now()->format('F Y').' ('.($tenant->plan?->name ?? 'plan').')',
            ]);
        }

        return $tenant;
    }

    private function tenant(Tenant|int|null $tenant): ?Tenant
    {
        return $tenant instanceof Tenant ? $tenant : ($tenant ? Tenant::find($tenant) : null);
    }
}
