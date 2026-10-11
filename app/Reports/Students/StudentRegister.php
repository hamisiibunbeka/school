<?php

namespace App\Reports\Students;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class StudentRegister extends Report
{
    public function key(): string
    {
        return 'student-register';
    }

    public function title(): string
    {
        return 'Student Register / Class List';
    }

    public function description(): string
    {
        return 'Full class list with admission numbers, residence, primary guardian and contact.';
    }

    public function category(): string
    {
        return 'students';
    }

    public function icon(): string
    {
        return 'list';
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
            $this->selectFilter('status', 'Status', $this->enum(['active', 'on_leave', 'suspended', 'transferred', 'graduated', 'withdrawn', 'archived']), 'active', 'Any status'),
            $this->selectFilter('gender', 'Gender', $this->enum(['male', 'female']), '', 'Any gender'),
            $this->selectFilter('residence', 'Residence', $this->enum(['day', 'boarding']), '', 'Day & boarding'),
        ];
    }

    public function run(array $f): array
    {
        $primary = DB::table('guardian_student')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->where('guardians.school_id', $this->schoolId())
            ->selectRaw("guardian_student.student_id, MAX(CONCAT(guardians.first_name, ' ', guardians.last_name)) as guardian, MAX(guardians.phone) as phone")
            ->where('guardian_student.is_primary', true)
            ->groupBy('guardian_student.student_id');

        $rows = $this->table('students')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->leftJoinSub($primary, 'pg', 'pg.student_id', '=', 'students.id')
            ->whereNull('students.deleted_at')
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('students.stream_id', $v))
            ->when($f['status'], fn ($q, $v) => $q->where('students.status', $v))
            ->when($f['gender'], fn ($q, $v) => $q->where('students.gender', $v))
            ->when($f['residence'], fn ($q, $v) => $q->where('students.residence_type', $v))
            ->orderBy('school_classes.level')->orderBy('streams.name')->orderBy('students.first_name')->orderBy('students.last_name')
            ->get([
                'students.id', 'students.admission_no', $this->studentName(), 'students.gender',
                DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
                'students.residence_type', 'students.date_of_birth', 'students.admission_date',
                DB::raw("COALESCE(pg.guardian, '') as guardian"), DB::raw("COALESCE(pg.phone, '') as phone"), 'students.status',
            ]);

        $rows = $this->rows($rows);
        foreach ($rows as $i => &$r) {
            $r['sn'] = $i + 1;
        }
        unset($r);

        $male = count(array_filter($rows, fn ($r) => $r['gender'] === 'male'));
        $boarding = count(array_filter($rows, fn ($r) => $r['residence_type'] === 'boarding'));

        return [
            'columns' => [
                $this->col('sn', '#', 'number'),
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('gender', 'Gender', 'badge'),
                $this->col('class', 'Class'),
                $this->col('residence_type', 'Residence', 'badge'),
                $this->col('date_of_birth', 'Date of birth', 'date'),
                $this->col('admission_date', 'Admitted', 'date'),
                $this->col('guardian', 'Primary guardian'),
                $this->col('phone', 'Phone'),
                $this->col('status', 'Status', 'badge'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('Students', count($rows), 'number', 'primary', 'users'),
                $this->stat('Boys', $male, 'number', 'info', 'user'),
                $this->stat('Girls', count($rows) - $male, 'number', 'warning', 'user'),
                $this->stat('Boarders', $boarding, 'number', 'secondary', 'bed'),
            ],
        ];
    }
}
