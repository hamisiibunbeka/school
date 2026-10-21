<?php

namespace App\Services\Academics;

use App\Models\Exam;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Subject;
use App\Support\EducationLevel;
use App\Support\Tenancy;

/**
 * A-Level (ACSEE) rules, driven by data instead of code:
 *
 * - Subject categories: principal, compulsory subsidiary, optional subsidiary (or not A-Level).
 * - A combination = 3 principal subjects + the optional subsidiaries it takes (e.g. BAM).
 * - Every student also takes the compulsory subsidiaries of their class's rules.
 * - Class rules: "current" (the school's categories and average setting) or pinned to an older system,
 *   so a cohort can finish under the rules it started with (e.g. Form Six on General Studies).
 * - Published exams keep the rules that applied when they were published (`exams.a_level_rules`).
 *
 * The division always uses the best 3 principal subjects; the average uses all subjects or principals only.
 */
class ALevelRules
{
    public const PRINCIPAL = 'principal';

    public const COMPULSORY = 'compulsory';

    public const OPTIONAL = 'optional';

    public const CATEGORIES = [self::PRINCIPAL, self::COMPULSORY, self::OPTIONAL];

    public const AVERAGE_ALL = 'all';

    public const AVERAGE_PRINCIPAL = 'principal';

    /** School setting: what the A-Level average counts under the current rules. */
    public const AVERAGE_SETTING = 'a_level_average';

    private ?array $current = null;

    /** @return array{label:string, compulsory:array<int,int>, average:string, pinned:bool} */
    public function current(): array
    {
        return $this->current ??= [
            'label' => 'Current rules',
            'compulsory' => Subject::where('a_level_category', self::COMPULSORY)->orderBy('name')->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'average' => $this->currentAverage(),
            'pinned' => false,
        ];
    }

    public function currentAverage(): string
    {
        $value = app(Tenancy::class)->school()?->setting(self::AVERAGE_SETTING);

        return $value === self::AVERAGE_PRINCIPAL ? self::AVERAGE_PRINCIPAL : self::AVERAGE_ALL;
    }

    /** @return array{label:string, compulsory:array<int,int>, average:string, pinned:bool} */
    public function forClass(SchoolClass|int $class): array
    {
        $class = $class instanceof SchoolClass ? $class : SchoolClass::find($class);
        $pinned = $class?->a_level_rules;
        if (! is_array($pinned)) {
            return $this->current();
        }

        return [
            'label' => (string) ($pinned['label'] ?? 'Pinned rules'),
            'compulsory' => array_values(array_map('intval', $pinned['compulsory'] ?? [])),
            'average' => ($pinned['average'] ?? null) === self::AVERAGE_PRINCIPAL ? self::AVERAGE_PRINCIPAL : self::AVERAGE_ALL,
            'pinned' => true,
        ];
    }

    /**
     * Subjects of each A-Level stream of a class under its live rules.
     *
     * @return array<int, array{code:string, principal:array<int,int>, subjects:array<int,int>}>
     */
    public function streams(int $classId): array
    {
        $rules = $this->forClass($classId);

        return Stream::with('combination.items')->where('school_class_id', $classId)->whereNotNull('combination_id')->get()
            ->filter(fn (Stream $s) => $s->combination)
            ->mapWithKeys(fn (Stream $s) => [$s->id => $this->streamEntry($s, $rules)])->all();
    }

    /** One stream's subjects under the given rules. */
    public function streamEntry(Stream $stream, ?array $rules = null): array
    {
        $rules ??= $this->forClass($stream->school_class_id);
        $principal = $stream->combination->principalIds();

        return [
            'code' => $stream->combination->code,
            'principal' => $principal,
            'subjects' => array_values(array_unique([...$principal, ...$stream->combination->optionalIds(), ...$rules['compulsory']])),
        ];
    }

    /**
     * Rules for a class in an exam: the snapshot taken when it was first published (kept even while it is
     * unpublished for corrections), otherwise the class's live rules.
     *
     * @return array{average:string, streams:array<int, array{code:string, principal:array<int,int>, subjects:array<int,int>}>}
     */
    public function forExam(?Exam $exam, int $classId): array
    {
        $frozen = $exam?->a_level_rules[$classId] ?? null;
        if (is_array($frozen)) {
            $streams = [];
            foreach ($frozen['streams'] ?? [] as $streamId => $s) {
                $streams[(int) $streamId] = ['code' => (string) ($s['code'] ?? ''), 'principal' => array_map('intval', $s['principal'] ?? []), 'subjects' => array_map('intval', $s['subjects'] ?? [])];
            }

            return ['average' => ($frozen['average'] ?? null) === self::AVERAGE_PRINCIPAL ? self::AVERAGE_PRINCIPAL : self::AVERAGE_ALL, 'streams' => $streams];
        }

        return ['average' => $this->forClass($classId)['average'], 'streams' => $this->streams($classId)];
    }

    /** Snapshot the rules of the exam's A-Level classes (called when results are published). */
    public function freeze(Exam $exam): void
    {
        $frozen = [];
        foreach ($exam->classes()->where('education_level', EducationLevel::A_LEVEL)->get() as $class) {
            $frozen[$class->id] = ['average' => $this->forClass($class)['average'], 'streams' => $this->streams($class->id)];
        }
        $exam->forceFill(['a_level_rules' => $frozen ?: null])->save();
    }

    /** Keep a class on the rules it uses now, whatever changes later (e.g. Form Six finishing the old system). */
    public function pin(SchoolClass $class, ?string $label = null): void
    {
        $rules = $this->forClass($class);
        $class->forceFill(['a_level_rules' => [
            'label' => $label ?? ($rules['pinned'] ? $rules['label'] : 'Rules kept from '.today()->format('M Y')),
            'compulsory' => $rules['compulsory'],
            'average' => $rules['average'],
        ]])->save();
    }

    /** Let a class follow the school's current rules. */
    public function follow(SchoolClass $class): void
    {
        $class->forceFill(['a_level_rules' => null])->save();
    }

    /** Forget cached current rules after categories or settings change. */
    public function refresh(): void
    {
        $this->current = null;
    }
}
