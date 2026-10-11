<?php

namespace App\Support;

use App\Models\AcademicYear;
use App\Models\Account;
use App\Models\Department;
use App\Models\Employee;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Subject;
use App\Models\Term;

/**
 * Select-box options shared by many pages, already scoped to the current school.
 * Every method returns [{value, label, ...extra}] arrays ready for the frontend <Select>.
 */
class Lookups
{
    /** @return array<int, array{value:int, label:string, streams: array<int, array{value:int,label:string}>}> */
    public static function classes(): array
    {
        return SchoolClass::with('streams:id,school_class_id,name')
            ->orderBy('level')->orderBy('name')
            ->get(['id', 'name', 'level'])
            ->map(fn ($c) => [
                'value' => $c->id,
                'label' => $c->name,
                'streams' => $c->streams->map(fn ($s) => ['value' => $s->id, 'label' => $s->name])->values()->all(),
            ])->all();
    }

    /** @return array<int, array{value:int, label:string, school_class_id:int}> */
    public static function streams(): array
    {
        return Stream::with('schoolClass:id,name')->get()
            ->map(fn ($s) => ['value' => $s->id, 'label' => "{$s->schoolClass?->name} {$s->name}", 'school_class_id' => $s->school_class_id])
            ->all();
    }

    /** @return array<int, array{value:int, label:string, is_current:bool}> */
    public static function academicYears(): array
    {
        return AcademicYear::orderByDesc('start_date')->get()
            ->map(fn ($y) => ['value' => $y->id, 'label' => $y->name, 'is_current' => $y->is_current])->all();
    }

    /** @return array<int, array{value:int, label:string, academic_year_id:int, is_current:bool}> */
    public static function terms(): array
    {
        return Term::with('academicYear:id,name')->orderByDesc('start_date')->get()
            ->map(fn ($t) => [
                'value' => $t->id,
                'label' => "{$t->name} — {$t->academicYear?->name}",
                'academic_year_id' => $t->academic_year_id,
                'is_current' => $t->is_current,
            ])->all();
    }

    /** @return array<int, array{value:int, label:string}> */
    public static function subjects(): array
    {
        return Subject::orderBy('name')->get(['id', 'name', 'code'])
            ->map(fn ($s) => ['value' => $s->id, 'label' => $s->code ? "{$s->name} ({$s->code})" : $s->name])->all();
    }

    /** @return array<int, array{value:int, label:string}> */
    public static function employees(?string $category = null): array
    {
        return Employee::where('status', 'active')
            ->when($category, fn ($q) => $q->where('category', $category))
            ->orderBy('first_name')->get(['id', 'first_name', 'last_name', 'employee_no'])
            ->map(fn ($e) => ['value' => $e->id, 'label' => "{$e->full_name} ({$e->employee_no})"])->all();
    }

    /** @return array<int, array{value:int, label:string}> */
    public static function teachers(): array
    {
        return static::employees('teaching');
    }

    /** @return array<int, array{value:int, label:string}> */
    public static function departments(): array
    {
        return Department::orderBy('name')->get(['id', 'name'])->map(fn ($d) => ['value' => $d->id, 'label' => $d->name])->all();
    }

    /**
     * Postable ledger accounts, optionally filtered by type(s) or sub_type(s).
     *
     * @param  array<int,string>|string|null  $types
     * @param  array<int,string>|string|null  $subTypes
     * @return array<int, array{value:int, label:string, type:string, sub_type:?string}>
     */
    public static function accounts(array|string|null $types = null, array|string|null $subTypes = null): array
    {
        return Account::postable()
            ->when($types, fn ($q) => $q->whereIn('type', (array) $types))
            ->when($subTypes, fn ($q) => $q->whereIn('sub_type', (array) $subTypes))
            ->orderBy('code')->get(['id', 'code', 'name', 'type', 'sub_type'])
            ->map(fn ($a) => ['value' => $a->id, 'label' => "{$a->code} · {$a->name}", 'type' => $a->type, 'sub_type' => $a->sub_type])->all();
    }

    /** Cash, bank and mobile-money accounts used to receive or pay money. */
    public static function cashAccounts(): array
    {
        return static::accounts('asset', ['cash', 'bank', 'mobile_money']);
    }

    /** @param  array<int,string>  $values */
    public static function enum(array $values): array
    {
        return array_map(fn ($v) => ['value' => $v, 'label' => ucwords(str_replace(['_', '-'], ' ', $v))], $values);
    }
}
