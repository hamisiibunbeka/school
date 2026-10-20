<?php

namespace App\Console\Commands;

use App\Models\FeePaymentAgreement;
use App\Models\School;
use App\Services\Fees\AdmissionClearanceService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

/** Daily follow-up of fee payment agreements: settle honoured ones and notify finance of due-soon / overdue ones. */
class FollowUpPaymentAgreements extends Command
{
    protected $signature = 'fees:follow-up-agreements';

    protected $description = 'Honour settled payment agreements and notify finance about agreements falling due or overdue';

    public function handle(Tenancy $tenancy): int
    {
        $schoolIds = FeePaymentAgreement::withoutGlobalScopes()->where('status', 'active')->distinct()->pluck('school_id');
        $totals = ['honoured' => 0, 'due_soon' => 0, 'overdue' => 0];

        foreach (School::whereIn('id', $schoolIds)->get() as $school) {
            $result = $tenancy->runAs($school, fn () => app(AdmissionClearanceService::class)->followUp());
            foreach ($totals as $key => $value) {
                $totals[$key] = $value + $result[$key];
            }
        }

        $this->info("Agreements honoured: {$totals['honoured']}, due-soon notices: {$totals['due_soon']}, overdue notices: {$totals['overdue']}.");

        return self::SUCCESS;
    }
}
