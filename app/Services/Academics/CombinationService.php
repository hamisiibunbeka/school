<?php

namespace App\Services\Academics;

use App\Models\ClassSubject;
use App\Models\Combination;
use App\Models\Stream;
use App\Models\Subject;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A-Level combinations: 3 principal subjects, General Studies always as a
 * subsidiary, and Basic Applied Mathematics (BAM) as a subsidiary when the
 * school ticks "requires BAM" for that combination.
 */
class CombinationService
{
    /**
     * Subjects used by A-Level combinations: key => [name, code, other names to match].
     *
     * @var array<string, array{0:string,1:string,2:array<int,string>}>
     */
    public const SUBJECTS = [
        'P' => ['Physics', 'PHY', []],
        'C' => ['Chemistry', 'CHEM', []],
        'B' => ['Biology', 'BIO', []],
        'M' => ['Advanced Mathematics', 'AMATH', ['Advanced Maths', 'Adv Mathematics']],
        'G' => ['Geography', 'GEO', []],
        'H' => ['History', 'HIST', []],
        'K' => ['Kiswahili', 'KISW', []],
        'L' => ['English Language', 'ENG', ['English']],
        'F' => ['French', 'FRE', []],
        'E' => ['Economics', 'ECON', []],
        'Co' => ['Commerce', 'COMM', []],
        'Ac' => ['Accountancy', 'ACC', ['Accounting', 'Book Keeping']],
        'A' => ['Agriculture', 'AGRI', []],
        'N' => ['Food and Human Nutrition', 'FHN', ['Nutrition', 'Food & Human Nutrition']],
        'Cs' => ['Computer Science', 'CS', []],
        'GS' => ['General Studies', 'GS', []],
        'BAM' => ['Basic Applied Mathematics', 'BAM', ['Basic Applied Maths']],
    ];

    /**
     * Standard combinations (the long-established set). Schools can add the
     * newer ones (e.g. HGFa, HGLi, EBuAc) themselves.
     *
     * @var array<string, array{0:string, 1:array<int,string>, 2:bool}> code => [name, principal keys, requires BAM]
     */
    public const STANDARD = [
        'PCM' => ['Physics, Chemistry, Advanced Mathematics', ['P', 'C', 'M'], false],
        'PCB' => ['Physics, Chemistry, Biology', ['P', 'C', 'B'], true],
        'PGM' => ['Physics, Geography, Advanced Mathematics', ['P', 'G', 'M'], false],
        'EGM' => ['Economics, Geography, Advanced Mathematics', ['E', 'G', 'M'], false],
        'CBG' => ['Chemistry, Biology, Geography', ['C', 'B', 'G'], true],
        'CBA' => ['Chemistry, Biology, Agriculture', ['C', 'B', 'A'], true],
        'CBN' => ['Chemistry, Biology, Food and Human Nutrition', ['C', 'B', 'N'], true],
        'PMC' => ['Physics, Advanced Mathematics, Computer Science', ['P', 'M', 'Cs'], false],
        'HGL' => ['History, Geography, English Language', ['H', 'G', 'L'], false],
        'HGK' => ['History, Geography, Kiswahili', ['H', 'G', 'K'], false],
        'HKL' => ['History, Kiswahili, English Language', ['H', 'K', 'L'], false],
        'HGE' => ['History, Geography, Economics', ['H', 'G', 'E'], false],
        'KLF' => ['Kiswahili, English Language, French', ['K', 'L', 'F'], false],
        'ECA' => ['Economics, Commerce, Accountancy', ['E', 'Co', 'Ac'], true],
    ];

    /** Create the standard combinations (and any missing subjects). Returns how many were added. */
    public function seedStandard(): int
    {
        $added = 0;
        DB::transaction(function () use (&$added) {
            foreach (self::STANDARD as $code => [$name, $keys, $bam]) {
                if (Combination::where('code', $code)->exists()) {
                    continue;
                }
                $combination = Combination::create(['code' => $code, 'name' => $name, 'requires_bam' => $bam, 'is_active' => true]);
                $this->syncSubjects($combination, array_map(fn ($k) => $this->subjectId($k), $keys));
                $added++;
            }
        });

        return $added;
    }

    /**
     * @param  array{code:string, name:string, principal_subject_ids:array<int,int|string>, requires_bam?:bool, is_active?:bool, notes?:?string}  $data
     */
    public function save(?Combination $combination, array $data): Combination
    {
        $principal = array_values(array_unique(array_map('intval', $data['principal_subject_ids'])));
        $subsidiaryIds = [$this->subjectId('GS'), $this->subjectId('BAM')];
        if (array_intersect($principal, $subsidiaryIds)) {
            throw ValidationException::withMessages(['principal_subject_ids' => 'General Studies and Basic Applied Mathematics are subsidiary subjects, not principal subjects.']);
        }

        return DB::transaction(function () use ($combination, $data, $principal) {
            $attributes = [
                'code' => trim($data['code']), // keep the official casing, e.g. HGFa, EBuAc
                'name' => $data['name'],
                'requires_bam' => (bool) ($data['requires_bam'] ?? false),
                'is_active' => (bool) ($data['is_active'] ?? true),
                'notes' => $data['notes'] ?? null,
            ];
            $combination ? $combination->update($attributes) : $combination = Combination::create($attributes);
            $this->syncSubjects($combination, $principal);

            return $combination;
        });
    }

    /** Rewrite the subject list: given principals + GS + BAM (if required); keep linked streams' allocations in step. */
    public function syncSubjects(Combination $combination, array $principalIds): void
    {
        $rows = collect($principalIds)->mapWithKeys(fn ($id) => [(int) $id => Combination::PRINCIPAL]);
        $rows[$this->subjectId('GS')] = Combination::SUBSIDIARY;
        if ($combination->requires_bam) {
            $rows[$this->subjectId('BAM')] = Combination::SUBSIDIARY;
        }

        $combination->items()->whereNotIn('subject_id', $rows->keys())->delete();
        foreach ($rows as $subjectId => $role) {
            $combination->items()->updateOrCreate(['subject_id' => $subjectId], ['role' => $role]);
        }
        $combination->unsetRelation('items');

        foreach ($combination->streams()->get() as $stream) {
            $this->syncStreamAllocations($stream);
        }
    }

    /**
     * Make the combination's subjects available for mark entry in the stream:
     * one stream-level allocation per subject (teacher assigned later).
     * Allocations for subjects no longer in the combination are left alone
     * if a teacher is assigned, otherwise removed.
     */
    public function syncStreamAllocations(Stream $stream): void
    {
        $stream->loadMissing('combination.items');
        $subjectIds = $stream->combination?->subjectIds() ?? [];

        ClassSubject::where('stream_id', $stream->id)->whereNull('employee_id')->whereNotIn('subject_id', $subjectIds ?: [0])->delete();

        foreach ($subjectIds as $subjectId) {
            $exists = ClassSubject::where('school_class_id', $stream->school_class_id)
                ->where('subject_id', $subjectId)
                ->where(fn ($q) => $q->whereNull('stream_id')->orWhere('stream_id', $stream->id))
                ->exists();
            if (! $exists) {
                ClassSubject::create(['school_class_id' => $stream->school_class_id, 'stream_id' => $stream->id, 'subject_id' => $subjectId]);
            }
        }
    }

    /** Find (by code or name) or create the school subject for a catalogue key. */
    public function subjectId(string $key): int
    {
        [$name, $code, $aliases] = self::SUBJECTS[$key];

        $subject = Subject::where('code', $code)->first()
            ?? Subject::whereIn(DB::raw('LOWER(name)'), array_map('mb_strtolower', [$name, ...$aliases]))->first()
            ?? Subject::create(['name' => $name, 'code' => $code, 'type' => in_array($key, ['GS', 'BAM'], true) ? 'core' : 'elective']);

        return $subject->id;
    }
}
