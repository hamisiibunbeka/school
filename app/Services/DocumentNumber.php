<?php

namespace App\Services;

use App\Models\DocumentSequence;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

/**
 * Generates sequential, gap-resistant document numbers per school
 * (receipts, invoices, journals, admission numbers ...).
 */
class DocumentNumber
{
    /** Default prefixes; schools can change them in Settings. */
    public const DEFAULTS = [
        'invoice' => 'INV-',
        'receipt' => 'RCT-',
        'journal' => 'JV-',
        'expense' => 'PV-',
        'admission' => 'ADM-',
        'application' => 'APP-',
        'employee' => 'EMP-',
        'purchase_order' => 'PO-',
        'pocket_money' => 'PM-',
        'transfer' => 'TRF-',
    ];

    public static function next(string $type): string
    {
        $schoolId = app(Tenancy::class)->schoolId();

        return DB::transaction(function () use ($type, $schoolId) {
            $sequence = DocumentSequence::where('school_id', $schoolId)
                ->where('type', $type)
                ->lockForUpdate()
                ->first();

            if (! $sequence) {
                $sequence = DocumentSequence::create([
                    'school_id' => $schoolId,
                    'type' => $type,
                    'prefix' => self::DEFAULTS[$type] ?? strtoupper(substr($type, 0, 3)).'-',
                    'next_number' => 1,
                    'padding' => 5,
                ]);
            }

            $number = $sequence->prefix.str_pad((string) $sequence->next_number, $sequence->padding, '0', STR_PAD_LEFT);
            $sequence->increment('next_number');

            return $number;
        });
    }
}
