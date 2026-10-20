<?php

namespace App\Services\Fees;

use App\Models\Invoice;
use App\Models\School;
use App\Models\User;

/**
 * Everything an invoice layout can print, in one shape — for a real invoice or for sample data in the
 * layout gallery and designer. Consumed by resources/js/components/invoice-layout/document.tsx.
 */
class InvoiceDocument
{
    /** @return array<string, mixed> */
    public static function for(Invoice $invoice, ?School $school): array
    {
        $invoice->loadMissing(['student.schoolClass:id,name', 'student.stream:id,name', 'student.guardians', 'items.feeCategory:id,name', 'term:id,name', 'academicYear:id,name', 'allocations.payment', 'creator:id,name']);
        $student = $invoice->student;
        $guardian = $student?->guardians->firstWhere('pivot.is_primary', true) ?? $student?->guardians->first();
        $currency = $school?->currency ?? 'TZS';

        return [
            'school' => self::school($school),
            'currency' => $currency,
            'invoice' => [
                'invoice_no' => $invoice->invoice_no,
                'issue_date' => $invoice->issue_date?->toDateString(),
                'due_date' => $invoice->due_date?->toDateString(),
                'period' => trim(($invoice->term?->name ?? '').' '.($invoice->academicYear?->name ?? '')) ?: 'General',
                'status' => $invoice->status,
                'overdue' => in_array($invoice->status, ['unpaid', 'partial'], true) && $invoice->due_date && $invoice->due_date->lt(today()),
                'subtotal' => (string) $invoice->subtotal,
                'discount' => (string) $invoice->discount,
                'total' => (string) $invoice->total,
                'paid' => (string) $invoice->paid,
                'balance' => (string) $invoice->balance,
                'total_words' => AmountInWords::convert((string) $invoice->total, $currency),
                'balance_words' => AmountInWords::convert((string) $invoice->balance, $currency),
                'notes' => $invoice->notes,
                'created_by' => $invoice->creator?->name,
                'items' => $invoice->items->map(fn ($it) => [
                    'description' => $it->description,
                    'category' => $it->feeCategory?->name,
                    'amount' => (string) $it->amount,
                    'discount' => (string) $it->discount,
                    'net' => (string) $it->net,
                ])->values(),
                'payments' => $invoice->allocations->map(fn ($a) => [
                    'receipt_no' => $a->payment?->receipt_no,
                    'payment_date' => $a->payment?->payment_date?->toDateString(),
                    'method' => $a->payment?->method,
                    'amount' => (string) $a->amount,
                ])->values(),
            ],
            'student' => $student ? [
                'full_name' => $student->full_name,
                'admission_no' => $student->admission_no,
                'class' => trim(($student->schoolClass?->name ?? '').' '.($student->stream?->name ?? '')),
                'residence_type' => $student->residence_type,
                'guardian' => $guardian ? ['name' => $guardian->full_name, 'phone' => $guardian->phone] : null,
                'account_balance' => (string) $student->feeBalance(),
            ] : null,
            'instructions' => PaymentInstructions::forCurrentSchool(),
        ];
    }

    /** Realistic sample invoice for previews (the school's own letterhead and payment details, made-up student). */
    public static function sample(?School $school, ?User $user = null): array
    {
        $currency = $school?->currency ?? 'TZS';
        $items = [
            ['description' => 'Tuition fee', 'category' => 'Tuition', 'amount' => '650000.00', 'discount' => '65000.00', 'net' => '585000.00'],
            ['description' => 'Boarding & meals', 'category' => 'Boarding', 'amount' => '450000.00', 'discount' => '0.00', 'net' => '450000.00'],
            ['description' => 'Examination fee', 'category' => 'Exams', 'amount' => '40000.00', 'discount' => '0.00', 'net' => '40000.00'],
            ['description' => 'Caution money', 'category' => 'Other', 'amount' => '25000.00', 'discount' => '0.00', 'net' => '25000.00'],
        ];

        return [
            'school' => self::school($school),
            'currency' => $currency,
            'invoice' => [
                'invoice_no' => 'INV-00128',
                'issue_date' => today()->startOfMonth()->toDateString(),
                'due_date' => today()->startOfMonth()->addDays(30)->toDateString(),
                'period' => 'Term I '.today()->year,
                'status' => 'partial',
                'overdue' => false,
                'subtotal' => '1165000.00',
                'discount' => '65000.00',
                'total' => '1100000.00',
                'paid' => '400000.00',
                'balance' => '700000.00',
                'total_words' => AmountInWords::convert('1100000', $currency),
                'balance_words' => AmountInWords::convert('700000', $currency),
                'notes' => 'Sibling discount of 10% applied on tuition.',
                'created_by' => $user?->name ?? 'Bursar',
                'items' => $items,
                'payments' => [['receipt_no' => 'RCT-00412', 'payment_date' => today()->startOfMonth()->addDays(5)->toDateString(), 'method' => 'mobile_money', 'amount' => '400000.00']],
            ],
            'student' => [
                'full_name' => 'Neema Joseph Mushi',
                'admission_no' => 'ADM-2026-0042',
                'class' => 'Form Two A',
                'residence_type' => 'boarding',
                'guardian' => ['name' => 'Joseph Mushi', 'phone' => '+255 754 000 111'],
                'account_balance' => '700000.00',
            ],
            // Platform previews have no school: show illustrative payment details instead.
            'instructions' => $school ? PaymentInstructions::forCurrentSchool() : [
                'banks' => [['bank' => 'CRDB Bank', 'account_name' => 'Your School', 'account_no' => '0150XXXXXXXX'], ['bank' => 'NMB Bank', 'account_name' => 'Your School', 'account_no' => '2041XXXXXXX']],
                'mobile' => [['provider' => 'M-Pesa', 'number' => '5XXXXX', 'name' => 'Lipa Namba']],
                'note' => 'Bring the bank slip or SMS confirmation to the bursar.',
            ],
        ];
    }

    /** @return array<string, ?string> */
    private static function school(?School $school): array
    {
        return [
            'name' => $school?->name ?? 'Your School',
            'motto' => $school?->motto,
            'logo_url' => $school?->logo_url,
            'address' => trim(implode(', ', array_filter([$school?->address, $school?->region]))) ?: null,
            'phone' => $school?->phone,
            'email' => $school?->email,
            'registration_no' => $school?->registration_no,
        ];
    }
}
