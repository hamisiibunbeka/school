<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Student;
use App\Services\Fees\PaymentInstructions;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Student fee statement: chronological invoices and receipts with a running balance. */
class StatementController extends Controller
{
    public function show(Request $request, Student $student): Response
    {
        $from = $request->date('from')?->toDateString();
        $to = $request->date('to')?->toDateString();
        $student->load(['schoolClass:id,name', 'stream:id,name', 'guardians']);

        $invoices = Invoice::where('student_id', $student->id)->billable()->with('term:id,name', 'academicYear:id,name')->get();
        $payments = Payment::where('student_id', $student->id)->posted()->get();

        $entries = collect();
        foreach ($invoices as $i) {
            $entries->push([
                'date' => $i->issue_date->toDateString(),
                'sort' => 0,
                'type' => 'invoice',
                'id' => $i->id,
                'number' => $i->invoice_no,
                'description' => 'Fee invoice'.($i->term ? " — {$i->term->name} {$i->academicYear?->name}" : '').(bccomp((string) $i->discount, '0', 2) > 0 ? ' (after discount '.number_format((float) $i->discount).')' : ''),
                'debit' => (string) $i->total,
                'credit' => '0.00',
            ]);
        }
        foreach ($payments as $p) {
            $entries->push([
                'date' => $p->payment_date->toDateString(),
                'sort' => 1,
                'type' => 'payment',
                'id' => $p->id,
                'number' => $p->receipt_no,
                'description' => 'Payment received — '.ucwords(str_replace('_', ' ', $p->method)).($p->reference ? " ({$p->reference})" : ''),
                'debit' => '0.00',
                'credit' => (string) $p->amount,
            ]);
        }

        $entries = $entries->sortBy(fn ($e) => $e['date'].'-'.$e['sort'].'-'.str_pad((string) $e['id'], 10, '0', STR_PAD_LEFT))->values();

        $opening = '0.00';
        $rows = [];
        $running = '0.00';
        $totalDr = '0.00';
        $totalCr = '0.00';

        foreach ($entries as $e) {
            if ($from && $e['date'] < $from) {
                $opening = bcadd($opening, bcsub($e['debit'], $e['credit'], 2), 2);
                $running = $opening;

                continue;
            }
            if ($to && $e['date'] > $to) {
                continue;
            }
            $running = bcadd($running, bcsub($e['debit'], $e['credit'], 2), 2);
            $totalDr = bcadd($totalDr, $e['debit'], 2);
            $totalCr = bcadd($totalCr, $e['credit'], 2);
            $rows[] = $e + ['balance' => $running];
        }

        $guardian = $student->guardians->firstWhere('pivot.is_primary', true) ?? $student->guardians->first();

        return Inertia::render('fees/statement', [
            'student' => [
                'id' => $student->id,
                'full_name' => $student->full_name,
                'admission_no' => $student->admission_no,
                'photo_url' => $student->photo_url,
                'class' => trim(($student->schoolClass?->name ?? '').' '.($student->stream?->name ?? '')),
                'residence_type' => $student->residence_type,
                'status' => $student->status,
                'guardian' => $guardian ? ['name' => $guardian->full_name, 'phone' => $guardian->phone, 'address' => $guardian->address] : null,
            ],
            'entries' => $rows,
            'summary' => [
                'opening' => $opening,
                'debits' => $totalDr,
                'credits' => $totalCr,
                'closing' => $running,
                'outstanding' => $invoices->reduce(fn ($c, $i) => bcadd($c, (string) $i->balance, 2), '0.00'),
                'credit' => $payments->reduce(fn ($c, $p) => bcadd($c, (string) $p->unallocated, 2), '0.00'),
            ],
            'filters' => ['from' => $from ?? '', 'to' => $to ?? ''],
            'instructions' => PaymentInstructions::forCurrentSchool(),
        ]);
    }
}
