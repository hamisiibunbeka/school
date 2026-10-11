<?php

namespace App\Reports\Students;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class GuardianContacts extends Report
{
    public function key(): string
    {
        return 'guardian-contacts';
    }

    public function title(): string
    {
        return 'Guardian & Emergency Contact List';
    }

    public function description(): string
    {
        return 'Emergency contact sheet: guardians, phones, pickup rights plus allergies and blood group.';
    }

    public function category(): string
    {
        return 'students';
    }

    public function icon(): string
    {
        return 'phone';
    }

    public function permissions(): array
    {
        return ['students.view'];
    }

    public function filters(): array
    {
        return [
            $this->classFilter(),
            $this->streamFilter(),
            $this->selectFilter('primary', 'Guardians', [['value' => 'primary', 'label' => 'Primary guardian only'], ['value' => 'pickup', 'label' => 'Authorised for pickup']], '', 'All guardians'),
            $this->selectFilter('residence', 'Residence', $this->enum(['day', 'boarding']), '', 'Day & boarding'),
        ];
    }

    public function run(array $f): array
    {
        $rows = $this->table('students')
            ->join('guardian_student', 'guardian_student.student_id', '=', 'students.id')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->whereNull('students.deleted_at')->where('students.status', 'active')
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('students.stream_id', $v))
            ->when($f['residence'], fn ($q, $v) => $q->where('students.residence_type', $v))
            ->when($f['primary'] === 'primary', fn ($q) => $q->where('guardian_student.is_primary', true))
            ->when($f['primary'] === 'pickup', fn ($q) => $q->where('guardian_student.can_pickup', true))
            ->orderBy('school_classes.level')->orderBy('streams.name')->orderBy('students.first_name')->orderByDesc('guardian_student.is_primary')
            ->get([
                'students.admission_no', $this->studentName(),
                DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
                DB::raw("CONCAT(guardians.first_name, ' ', guardians.last_name) as guardian"),
                'guardian_student.relationship', 'guardians.phone', 'guardians.alt_phone', 'guardians.email',
                DB::raw("IF(guardian_student.is_primary, 'Yes', 'No') as is_primary"),
                DB::raw("IF(guardian_student.can_pickup, 'Yes', 'No') as can_pickup"),
                'students.blood_group', 'students.allergies',
            ]);

        $rows = $this->rows($rows);

        return [
            'columns' => [
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('guardian', 'Guardian'),
                $this->col('relationship', 'Relationship'),
                $this->col('phone', 'Phone'),
                $this->col('alt_phone', 'Alt. phone'),
                $this->col('email', 'Email'),
                $this->col('is_primary', 'Primary'),
                $this->col('can_pickup', 'Pickup'),
                $this->col('blood_group', 'Blood group'),
                $this->col('allergies', 'Allergies'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('Contacts', count($rows), 'number', 'primary', 'phone'),
                $this->stat('Learners covered', count(array_unique(array_column($rows, 'admission_no'))), 'number', 'info', 'users'),
                $this->stat('With allergies', count(array_unique(array_column(array_filter($rows, fn ($r) => filled($r['allergies'])), 'admission_no'))), 'number', 'danger', 'heart-pulse'),
            ],
        ];
    }
}
