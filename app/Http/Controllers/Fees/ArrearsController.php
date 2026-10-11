<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Support\Lookups;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Arrears & aging (SRS 4.9: fee aging, debt reminders). */
class ArrearsController extends Controller
{
    private const FILTERS = ['search', 'class', 'stream', 'bucket', 'residence'];

    public const BUCKETS = ['current' => 'Not yet due', 'd30' => '1–30 days', 'd60' => '31–60 days', 'd90' => '61–90 days', 'd90p' => '90+ days'];

    public function index(Request $request): Response
    {
        $filters = $request->only(self::FILTERS);

        $rows = $this->aging($filters)
            ->orderByDesc('total')
            ->paginate($this->perPage())->withQueryString();

        $ids = collect($rows->items())->pluck('student_id');
        $guardians = $this->primaryGuardians($ids->all());
        $reminded = $this->lastReminders($ids->all());

        $rows->through(fn ($r) => [
            'id' => (int) $r->student_id,
            'student_id' => (int) $r->student_id,
            'full_name' => trim("{$r->first_name} {$r->middle_name} {$r->last_name}"),
            'admission_no' => $r->admission_no,
            'class' => trim(($r->class_name ?? '').' '.($r->stream_name ?? '')),
            'residence_type' => $r->residence_type,
            'invoices' => (int) $r->invoices,
            'oldest_due' => $r->oldest_due,
            'days' => max(0, (int) $r->max_days),
            'current' => (string) $r->b_current,
            'd30' => (string) $r->b_30,
            'd60' => (string) $r->b_60,
            'd90' => (string) $r->b_90,
            'd90p' => (string) $r->b_90p,
            'total' => (string) $r->total,
            'guardian' => $guardians[$r->student_id] ?? null,
            'last_reminder' => $reminded[$r->admission_no] ?? null,
        ]);

        $sum = DB::query()->fromSub($this->aging($filters), 'a')
            ->selectRaw('COUNT(*) as students, COALESCE(SUM(total),0) as total, COALESCE(SUM(b_current),0) as current_b, COALESCE(SUM(b_30),0) as b30, COALESCE(SUM(b_60),0) as b60, COALESCE(SUM(b_90),0) as b90, COALESCE(SUM(b_90p),0) as b90p')
            ->first();

        $byClass = DB::query()->fromSub($this->aging(array_merge($filters, ['class' => ''])), 'a')
            ->selectRaw('class_name, COUNT(*) as students, SUM(total) as total')->groupBy('class_name')->orderBy('class_name')->get()
            ->map(fn ($r) => ['class' => $r->class_name ?? 'Unassigned', 'students' => (int) $r->students, 'total' => (float) $r->total]);

        return Inertia::render('fees/arrears', [
            'rows' => $rows,
            'filters' => array_merge(array_fill_keys(self::FILTERS, ''), $filters),
            'summary' => [
                'students' => (int) $sum->students,
                'total' => (string) $sum->total,
                'buckets' => [
                    ['key' => 'current', 'label' => self::BUCKETS['current'], 'total' => (string) $sum->current_b],
                    ['key' => 'd30', 'label' => self::BUCKETS['d30'], 'total' => (string) $sum->b30],
                    ['key' => 'd60', 'label' => self::BUCKETS['d60'], 'total' => (string) $sum->b60],
                    ['key' => 'd90', 'label' => self::BUCKETS['d90'], 'total' => (string) $sum->b90],
                    ['key' => 'd90p', 'label' => self::BUCKETS['d90p'], 'total' => (string) $sum->b90p],
                ],
            ],
            'byClass' => $byClass,
            'classes' => Lookups::classes(),
            'buckets' => collect(self::BUCKETS)->except('current')->map(fn ($l, $k) => ['value' => $k, 'label' => "Has debt {$l} overdue"])->values(),
            'asAt' => now()->toDateString(),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(self::FILTERS);
        $this->audit('exported', null, 'Exported fee arrears aging', 'fees', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv(escape: '', stream: $out, fields: ['Admission No', 'Student', 'Class', 'Residence', 'Open Invoices', 'Days Overdue', 'Not Yet Due', '1-30', '31-60', '61-90', '90+', 'Total Outstanding', 'Guardian', 'Phone']);
            $rows = $this->aging($filters)->orderByDesc('total')->get();
            $guardians = $this->primaryGuardians($rows->pluck('student_id')->all());
            foreach ($rows as $r) {
                $g = $guardians[$r->student_id] ?? null;
                fputcsv(escape: '', stream: $out, fields: [$r->admission_no, trim("{$r->first_name} {$r->middle_name} {$r->last_name}"), trim(($r->class_name ?? '').' '.($r->stream_name ?? '')), $r->residence_type,
                    $r->invoices, max(0, (int) $r->max_days), $r->b_current, $r->b_30, $r->b_60, $r->b_90, $r->b_90p, $r->total, $g['name'] ?? '', $g['phone'] ?? '']);
            }
            fclose($out);
        }, 'fee-arrears-'.now()->format('Ymd').'.csv', ['Content-Type' => 'text/csv']);
    }

    /** Queue SMS reminders to primary guardians (message_logs rows, status queued). */
    public function remind(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'student_ids' => ['nullable', 'array'],
            'student_ids.*' => [Rule::exists('students', 'id')->where('school_id', $schoolId)],
            'filters' => ['nullable', 'array'],
        ]);

        $filters = array_intersect_key($data['filters'] ?? [], array_flip(self::FILTERS));
        $query = $this->aging($filters);
        if (! empty($data['student_ids'])) {
            $query->whereIn('invoices.student_id', $data['student_ids']);
        }
        $rows = $query->get();

        $guardians = $this->primaryGuardians($rows->pluck('student_id')->all());
        $alreadyToday = DB::table('message_logs')->where('school_id', $schoolId)->where('subject', 'like', 'Fee reminder%')
            ->whereDate('created_at', now()->toDateString())->pluck('subject')->flip();

        $school = $this->tenancy()->school();
        $currency = $school?->currency ?? 'TZS';
        $now = now();
        $insert = [];
        $skipped = 0;

        foreach ($rows as $r) {
            $g = $guardians[$r->student_id] ?? null;
            $subject = "Fee reminder: {$r->admission_no}";
            if (! $g || ! $g['phone'] || $alreadyToday->has($subject)) {
                $skipped++;

                continue;
            }

            // Keep the SMS free of sensitive detail: first name, admission no and the balance only.
            $message = sprintf(
                'Dear %s, this is a kind reminder that the school fee balance for %s (%s) is %s %s. Please pay using the admission number as reference. Thank you. - %s',
                $g['first_name'], $r->first_name, $r->admission_no, $currency, number_format((float) $r->total), $school?->name ?? 'School Bursar',
            );

            $insert[] = [
                'tenant_id' => $this->tenancy()->tenantId(),
                'school_id' => $schoolId,
                'channel' => 'sms',
                'recipient' => $g['phone'],
                'recipient_name' => $g['name'],
                'subject' => $subject,
                'message' => $message,
                'status' => 'queued',
                'credits' => (int) max(1, ceil(mb_strlen($message) / 160)),
                'sent_by' => $request->user()->id,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($insert, 200) as $chunk) {
            DB::table('message_logs')->insert($chunk);
        }

        $this->audit('reminded', null, 'Queued '.count($insert).' fee reminder SMS(es)', 'fees', null, ['count' => count($insert), 'skipped' => $skipped]);
        $this->toast(count($insert) > 0
            ? count($insert).' reminder SMS(es) queued'.($skipped ? " ({$skipped} skipped: no phone or already reminded today)" : '').'.'
            : 'No reminders queued — guardians have no phone number or were already reminded today.', count($insert) > 0 ? 'success' : 'warning');

        return back();
    }

    /** @param  array<string, mixed>  $filters */
    private function aging(array $filters): Builder
    {
        $schoolId = $this->tenancy()->schoolId();
        $today = now()->toDateString();
        $days = "DATEDIFF('{$today}', COALESCE(invoices.due_date, invoices.issue_date))";

        $query = DB::table('invoices')
            ->join('students', 'students.id', '=', 'invoices.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->where('invoices.school_id', $schoolId)
            ->whereIn('invoices.status', ['unpaid', 'partial'])
            ->where('invoices.balance', '>', 0)
            ->whereNull('students.deleted_at')
            ->when($filters['class'] ?? null, fn ($q, $c) => $q->where('students.school_class_id', $c))
            ->when($filters['stream'] ?? null, fn ($q, $s) => $q->where('students.stream_id', $s))
            ->when($filters['residence'] ?? null, fn ($q, $r) => $q->where('students.residence_type', $r))
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('students.first_name', 'like', "%{$s}%")
                ->orWhere('students.last_name', 'like', "%{$s}%")->orWhere('students.admission_no', 'like', "%{$s}%")))
            ->groupBy('invoices.student_id', 'students.first_name', 'students.middle_name', 'students.last_name', 'students.admission_no', 'students.residence_type', 'school_classes.name', 'streams.name')
            ->selectRaw("invoices.student_id, students.first_name, students.middle_name, students.last_name, students.admission_no, students.residence_type,
                school_classes.name as class_name, streams.name as stream_name, COUNT(*) as invoices, SUM(invoices.balance) as total,
                MIN(COALESCE(invoices.due_date, invoices.issue_date)) as oldest_due, MAX({$days}) as max_days,
                SUM(CASE WHEN {$days} <= 0 THEN invoices.balance ELSE 0 END) as b_current,
                SUM(CASE WHEN {$days} BETWEEN 1 AND 30 THEN invoices.balance ELSE 0 END) as b_30,
                SUM(CASE WHEN {$days} BETWEEN 31 AND 60 THEN invoices.balance ELSE 0 END) as b_60,
                SUM(CASE WHEN {$days} BETWEEN 61 AND 90 THEN invoices.balance ELSE 0 END) as b_90,
                SUM(CASE WHEN {$days} > 90 THEN invoices.balance ELSE 0 END) as b_90p");

        $min = ['d30' => 1, 'd60' => 31, 'd90' => 61, 'd90p' => 91][$filters['bucket'] ?? ''] ?? null;
        if ($min !== null) {
            $query->havingRaw("MAX({$days}) >= ?", [$min]);
        }

        return $query;
    }

    /**
     * @param  array<int, int>  $studentIds
     * @return array<int, array{name:string, first_name:string, phone:?string}>
     */
    private function primaryGuardians(array $studentIds): array
    {
        if (! $studentIds) {
            return [];
        }

        return DB::table('guardian_student')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->where('guardians.school_id', $this->tenancy()->schoolId())
            ->whereIn('guardian_student.student_id', $studentIds)
            ->orderByDesc('guardian_student.is_primary')->orderBy('guardian_student.id')
            ->get(['guardian_student.student_id', 'guardians.first_name', 'guardians.last_name', 'guardians.phone'])
            ->groupBy('student_id')
            ->map(fn ($g) => ['name' => trim("{$g->first()->first_name} {$g->first()->last_name}"), 'first_name' => $g->first()->first_name, 'phone' => $g->first()->phone])
            ->all();
    }

    /**
     * @param  array<int, int>  $studentIds
     * @return array<string, string>
     */
    private function lastReminders(array $studentIds): array
    {
        if (! $studentIds) {
            return [];
        }

        $adm = DB::table('students')->where('school_id', $this->tenancy()->schoolId())->whereIn('id', $studentIds)->pluck('admission_no');

        return DB::table('message_logs')->where('school_id', $this->tenancy()->schoolId())
            ->whereIn('subject', $adm->map(fn ($a) => "Fee reminder: {$a}"))
            ->groupBy('subject')->selectRaw('subject, MAX(created_at) as last_at')->get()
            ->mapWithKeys(fn ($r) => [substr($r->subject, strlen('Fee reminder: ')) => $r->last_at])->all();
    }
}
