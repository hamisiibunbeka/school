<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payslip extends SchoolModel
{
    protected function casts(): array
    {
        return [
            'basic_salary' => 'decimal:2',
            'allowances' => 'decimal:2',
            'gross_pay' => 'decimal:2',
            'paye' => 'decimal:2',
            'nssf_employee' => 'decimal:2',
            'other_deductions' => 'decimal:2',
            'total_deductions' => 'decimal:2',
            'net_pay' => 'decimal:2',
            'employer_contributions' => 'decimal:2',
            'breakdown' => 'array',
            'paid_at' => 'date',
        ];
    }

    public const PAYMENT_STATUSES = ['pending', 'paid', 'withheld'];

    public function paymentJournal(): BelongsTo
    {
        return $this->belongsTo(Journal::class, 'payment_journal_id');
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
