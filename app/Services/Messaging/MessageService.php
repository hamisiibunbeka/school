<?php

namespace App\Services\Messaging;

use App\Support\Tenancy;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Builds audiences, renders template variables and dispatches messages
 * through the configured SmsGateway (SRS 4.18 / 6).
 */
class MessageService
{
    public const SMS_SEGMENT = 160;

    public function __construct(protected ?SmsGateway $gateway = null)
    {
        $this->gateway ??= app()->bound(SmsGateway::class) ? app(SmsGateway::class) : new LogSmsGateway;
    }

    public function gateway(): SmsGateway
    {
        return $this->gateway;
    }

    /** SMS credits used by a message: 160 GSM characters for one SMS, 153 per part when longer. Email uses no SMS credits. */
    public static function credits(string $message, string $channel = 'sms'): int
    {
        if ($channel !== 'sms') {
            return 0;
        }

        return GsmText::segments($message);
    }

    /** Normalise a Tanzanian / international number to +XXXXXXXXXXXX, or null when invalid. */
    public static function normalizePhone(?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);

        if ($digits === '') {
            return null;
        }

        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            $digits = '255'.substr($digits, 1);
        } elseif (strlen($digits) === 9 && in_array($digits[0], ['6', '7'], true)) {
            $digits = '255'.$digits;
        }

        return strlen($digits) >= 10 && strlen($digits) <= 15 ? '+'.$digits : null;
    }

    /**
     * Split a typed / pasted list of phone numbers and emails. Entries are separated by
     * commas, semicolons or new lines; spaces inside a number ("0754 123 456") are kept
     * together, while a space-separated run of several numbers or emails is split.
     *
     * @return array<int, string>
     */
    public static function splitList(string $text): array
    {
        $out = [];
        foreach (preg_split('/[,;\r\n]+/', $text) ?: [] as $chunk) {
            $chunk = trim($chunk);
            if ($chunk === '') {
                continue;
            }
            if (! str_contains($chunk, '@') && self::normalizePhone($chunk) && strlen(preg_replace('/\D+/', '', $chunk)) <= 15) {
                $out[] = $chunk;

                continue;
            }
            array_push($out, ...array_filter(preg_split('/\s+/', $chunk) ?: []));
        }

        return $out;
    }

    /** @param  array<string, string|null>  $vars */
    public static function render(string $body, array $vars): string
    {
        $replace = [];
        foreach ($vars as $key => $value) {
            $replace['{'.$key.'}'] = (string) ($value ?? '');
        }

        return strtr($body, $replace);
    }

    /**
     * Outstanding balance per student for the current school.
     *
     * @return Collection<int, string>
     */
    public function balances(): Collection
    {
        return DB::table('invoices')
            ->where('invoices.school_id', $this->schoolId())
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->groupBy('student_id')
            ->selectRaw('student_id, SUM(balance) as balance')
            ->pluck('balance', 'student_id');
    }

    /**
     * Resolve an audience to a de-duplicated list of recipients.
     *
     * Audience types: guardians | class | defaulters (parents), students, staff, applicants,
     * suppliers, group (saved contact group) and custom (typed numbers / emails).
     * Optional filters: school_class_id, residence_type, category, department_id, status, contact_group_id.
     *
     * @param  array{type: string, school_class_id?: int|string|null, min_balance?: string|int|float|null, numbers?: string|null}  $audience
     * @return Collection<int, array{recipient: string, name: string|null, vars: array<string, string|null>}>
     */
    public function recipients(string $channel, array $audience): Collection
    {
        $schoolName = app(Tenancy::class)->school()?->name;
        $currency = app(Tenancy::class)->school()?->currency ?? 'TZS';

        $list = match ($audience['type']) {
            'staff' => $this->staffRecipients($channel, $audience),
            'students' => $this->studentRecipients($channel, $audience),
            'applicants' => $this->applicantRecipients($channel, $audience),
            'suppliers' => $this->contactRows($channel, DB::table('suppliers')->where('school_id', $this->schoolId())->orderBy('name')->get(['name', 'phone', 'email'])),
            'group' => $this->contactRows($channel, DB::table('contact_group_members')->where('school_id', $this->schoolId())->where('contact_group_id', $audience['contact_group_id'] ?? 0)->orderBy('name')->get(['name', 'phone', 'email'])),
            'custom' => $this->customRecipients($channel, (string) ($audience['numbers'] ?? '')),
            default => $this->guardianRecipients($channel, $audience, $currency),
        };

        return $list
            ->filter(fn ($r) => ! empty($r['recipient']))
            ->unique('recipient')
            ->map(function ($r) use ($schoolName) {
                $r['vars']['school_name'] = $schoolName;
                $r['vars']['name'] ??= $r['name'] ?? '';

                return $r;
            })
            ->values();
    }

    /**
     * Send a message to recipients synchronously, in chunks.
     *
     * @param  Collection<int, array{recipient: string, name: string|null, vars: array<string, string|null>}>  $recipients
     * @return array{sent: int, failed: int, credits: int}
     */
    public function dispatch(string $channel, ?string $subject, string $body, Collection $recipients, ?int $userId = null): array
    {
        $stats = ['sent' => 0, 'failed' => 0, 'credits' => 0];

        foreach ($recipients->chunk(100) as $chunk) {
            foreach ($chunk as $r) {
                $text = self::render($body, $r['vars']);
                $credits = self::credits($text, $channel);

                try {
                    $log = $this->gateway->send($channel, $r['recipient'], $text, [
                        'recipient_name' => $r['name'],
                        'subject' => $subject ? self::render($subject, $r['vars']) : null,
                        'credits' => $credits,
                        'sent_by' => $userId,
                    ]);
                    $log->status === 'failed' ? $stats['failed']++ : $stats['sent']++;
                    $stats['credits'] += $log->status === 'failed' ? 0 : $credits;
                } catch (\Throwable $e) {
                    report($e);
                    $stats['failed']++;
                }
            }
        }

        return $stats;
    }

    /** @return Collection<int, array{recipient: string|null, name: string|null, vars: array<string, string|null>}> */
    private function staffRecipients(string $channel, array $audience = []): Collection
    {
        return DB::table('employees')
            ->where('employees.school_id', $this->schoolId())
            ->where('status', 'active')
            ->when($audience['category'] ?? null, fn ($q, $v) => $q->where('category', $v))
            ->when($audience['department_id'] ?? null, fn ($q, $v) => $q->where('department_id', $v))
            ->orderBy('first_name')
            ->get(['first_name', 'last_name', 'phone', 'email'])
            ->map(fn ($e) => [
                'recipient' => $channel === 'email' ? ($e->email ?: null) : self::normalizePhone($e->phone),
                'name' => trim("{$e->first_name} {$e->last_name}"),
                'vars' => ['guardian_name' => trim("{$e->first_name} {$e->last_name}"), 'student_name' => '', 'class' => '', 'balance' => ''],
            ]);
    }

    /**
     * Active students through their own portal account contact (students table has no phone/email).
     *
     * @return Collection<int, array{recipient: string|null, name: string|null, vars: array<string, string|null>}>
     */
    private function studentRecipients(string $channel, array $audience): Collection
    {
        return DB::table('students')
            ->join('users', 'users.id', '=', 'students.user_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->where('students.school_id', $this->schoolId())
            ->whereNull('students.deleted_at')
            ->where('students.status', 'active')
            ->when($audience['school_class_id'] ?? null, fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->when($audience['residence_type'] ?? null, fn ($q, $v) => $q->where('students.residence_type', $v))
            ->orderBy('students.first_name')
            ->get(['students.first_name', 'students.last_name', 'users.phone', 'users.email', 'school_classes.name as class_name', 'streams.name as stream_name'])
            ->map(fn ($s) => [
                'recipient' => $channel === 'email' ? ($s->email ?: null) : self::normalizePhone($s->phone),
                'name' => trim("{$s->first_name} {$s->last_name}"),
                'vars' => ['guardian_name' => trim("{$s->first_name} {$s->last_name}"), 'student_name' => trim("{$s->first_name} {$s->last_name}"), 'class' => trim("{$s->class_name} {$s->stream_name}"), 'balance' => ''],
            ]);
    }

    /**
     * Admission applicants' guardians, optionally by application status, year and class applied for.
     *
     * @return Collection<int, array{recipient: string|null, name: string|null, vars: array<string, string|null>}>
     */
    private function applicantRecipients(string $channel, array $audience): Collection
    {
        $statuses = array_values(array_filter((array) ($audience['status'] ?? [])));

        return DB::table('admission_applications')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'admission_applications.school_class_id')
            ->where('admission_applications.school_id', $this->schoolId())
            ->when($statuses, fn ($q) => $q->whereIn('admission_applications.status', $statuses))
            ->when($audience['academic_year_id'] ?? null, fn ($q, $v) => $q->where('admission_applications.academic_year_id', $v))
            ->when($audience['school_class_id'] ?? null, fn ($q, $v) => $q->where('admission_applications.school_class_id', $v))
            ->orderBy('admission_applications.first_name')
            ->get(['admission_applications.first_name', 'admission_applications.last_name', 'guardian_name', 'guardian_phone', 'guardian_email', 'school_classes.name as class_name'])
            ->map(fn ($a) => [
                'recipient' => $channel === 'email' ? ($a->guardian_email ?: null) : self::normalizePhone($a->guardian_phone),
                'name' => $a->guardian_name,
                'vars' => ['guardian_name' => $a->guardian_name, 'student_name' => trim("{$a->first_name} {$a->last_name}"), 'class' => (string) $a->class_name, 'balance' => ''],
            ]);
    }

    /**
     * Generic name / phone / email rows (suppliers, contact group members).
     *
     * @param  Collection<int, object>  $rows
     * @return Collection<int, array{recipient: string|null, name: string|null, vars: array<string, string|null>}>
     */
    private function contactRows(string $channel, Collection $rows): Collection
    {
        return $rows->map(fn ($r) => [
            'recipient' => $channel === 'email' ? (filter_var((string) $r->email, FILTER_VALIDATE_EMAIL) ?: null) : self::normalizePhone($r->phone),
            'name' => $r->name,
            'vars' => ['guardian_name' => (string) $r->name, 'student_name' => '', 'class' => '', 'balance' => ''],
        ]);
    }

    /** @return Collection<int, array{recipient: string|null, name: string|null, vars: array<string, string|null>}> */
    private function customRecipients(string $channel, string $numbers): Collection
    {
        return collect(self::splitList($numbers))
            ->map(fn ($n) => [
                'recipient' => $channel === 'email'
                    ? (filter_var($n, FILTER_VALIDATE_EMAIL) ?: null)
                    : (str_contains($n, '@') ? null : self::normalizePhone($n)),
                'name' => null,
                'vars' => ['guardian_name' => 'Parent', 'student_name' => '', 'class' => '', 'balance' => ''],
            ]);
    }

    /**
     * Guardians of active students, optionally limited to a class or to fee defaulters.
     * One message per guardian; wards are combined in {student_name}.
     *
     * @param  array<string, mixed>  $audience
     * @return Collection<int, array{recipient: string|null, name: string|null, vars: array<string, string|null>}>
     */
    private function guardianRecipients(string $channel, array $audience, string $currency): Collection
    {
        $balances = $this->balances();
        $minBalance = $audience['type'] === 'defaulters' ? (string) ($audience['min_balance'] ?? 0) : null;

        $rows = DB::table('guardian_student')
            ->join('students', 'students.id', '=', 'guardian_student.student_id')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->where('students.school_id', $this->schoolId())
            ->where('guardians.school_id', $this->schoolId())
            ->whereNull('students.deleted_at')
            ->where('students.status', 'active')
            ->when(! empty($audience['school_class_id']), fn ($q) => $q->where('students.school_class_id', $audience['school_class_id']))
            ->when(! empty($audience['residence_type']), fn ($q) => $q->where('students.residence_type', $audience['residence_type']))
            ->orderByDesc('guardian_student.is_primary')
            ->get([
                'guardians.id as guardian_id', 'guardians.first_name as g_first', 'guardians.last_name as g_last', 'guardians.phone', 'guardians.email',
                'students.id as student_id', 'students.first_name as s_first', 'students.last_name as s_last',
                'school_classes.name as class_name', 'streams.name as stream_name',
            ]);

        return $rows->groupBy('guardian_id')->map(function (Collection $wards) use ($balances, $minBalance, $channel, $currency) {
            if ($minBalance !== null) {
                $wards = $wards->filter(fn ($w) => bccomp((string) ($balances[$w->student_id] ?? '0'), $minBalance, 2) > 0);
            }

            if ($wards->isEmpty()) {
                return null;
            }

            $first = $wards->first();
            $balance = $wards->reduce(fn ($carry, $w) => bcadd($carry, (string) ($balances[$w->student_id] ?? '0'), 2), '0');

            return [
                'recipient' => $channel === 'email' ? ($first->email ?: null) : self::normalizePhone($first->phone),
                'name' => trim("{$first->g_first} {$first->g_last}"),
                'vars' => [
                    'guardian_name' => trim("{$first->g_first} {$first->g_last}"),
                    'student_name' => $wards->map(fn ($w) => trim("{$w->s_first} {$w->s_last}"))->unique()->implode(' & '),
                    'class' => $wards->map(fn ($w) => trim("{$w->class_name} {$w->stream_name}"))->unique()->implode(', '),
                    'balance' => $currency.' '.number_format((float) $balance),
                ],
            ];
        })->filter()->values();
    }

    private function schoolId(): ?int
    {
        return app(Tenancy::class)->schoolId();
    }
}
