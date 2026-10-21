<?php

namespace App\Services\Academics;

use App\Models\ClassSubject;
use App\Models\Combination;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Subject;
use App\Support\EducationLevel;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A-Level combinations: 3 principal subjects plus the optional subsidiaries the combination takes (e.g. BAM).
 * Compulsory subsidiaries (currently Academic Communication and Historia ya Tanzania na Maadili) come from
 * each class's A-Level rules — see ALevelRules. Which subject is principal / compulsory / optional is set on
 * the subject itself (Academics → Subjects), so future syllabus changes need no code.
 */
class CombinationService
{
    /**
     * Subjects used at A-Level: key => [name, code, other names to match, category].
     *
     * @var array<string, array{0:string,1:string,2:array<int,string>,3:string}>
     */
    public const SUBJECTS = [
        'P' => ['Physics', 'PHY', [], ALevelRules::PRINCIPAL],
        'C' => ['Chemistry', 'CHEM', [], ALevelRules::PRINCIPAL],
        'B' => ['Biology', 'BIO', [], ALevelRules::PRINCIPAL],
        'M' => ['Advanced Mathematics', 'AMATH', ['Advanced Maths', 'Adv Mathematics'], ALevelRules::PRINCIPAL],
        'G' => ['Geography', 'GEO', [], ALevelRules::PRINCIPAL],
        'H' => ['History', 'HIST', [], ALevelRules::PRINCIPAL],
        'K' => ['Kiswahili', 'KISW', [], ALevelRules::PRINCIPAL],
        'L' => ['English Language', 'ENG', ['English'], ALevelRules::PRINCIPAL],
        'F' => ['French', 'FRE', [], ALevelRules::PRINCIPAL],
        'E' => ['Economics', 'ECON', [], ALevelRules::PRINCIPAL],
        'Co' => ['Commerce', 'COMM', [], ALevelRules::PRINCIPAL],
        'Ac' => ['Accountancy', 'ACC', ['Accounting', 'Book Keeping'], ALevelRules::PRINCIPAL],
        'A' => ['Agriculture', 'AGRI', [], ALevelRules::PRINCIPAL],
        'N' => ['Food and Human Nutrition', 'FHN', ['Nutrition', 'Food & Human Nutrition'], ALevelRules::PRINCIPAL],
        'Cs' => ['Computer Science', 'CS', [], ALevelRules::PRINCIPAL],
        'ACOM' => ['Academic Communication', 'ACOM', [], ALevelRules::COMPULSORY],
        'HTM' => ['Historia ya Tanzania na Maadili', 'HTM', ['History of Tanzania and Ethics', 'Historia ya Tanzania'], ALevelRules::COMPULSORY],
        'BAM' => ['Basic Applied Mathematics', 'BAM', ['Basic Applied Maths'], ALevelRules::OPTIONAL],
    ];

    /** The compulsory subsidiaries of the current ACSEE system (General Studies was abolished). */
    public const CURRENT_COMPULSORY = ['ACOM', 'HTM'];

    /**
     * Standard combinations (the long-established set). Schools can add the newer ones (e.g. HGFa, HGLi, EBuAc).
     *
     * @var array<string, array{0:string, 1:array<int,string>, 2:bool}> code => [name, principal keys, takes BAM]
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

    public function __construct(protected ALevelRules $rules) {}

    /** Create the standard combinations (and any missing subjects, incl. the current compulsory subsidiaries). */
    public function seedStandard(): int
    {
        $added = 0;
        DB::transaction(function () use (&$added) {
            $this->ensureCurrentSubsidiaries();
            foreach (self::STANDARD as $code => [$name, $keys, $bam]) {
                if (Combination::where('code', $code)->exists()) {
                    continue;
                }
                $combination = Combination::create(['code' => $code, 'name' => $name, 'is_active' => true]);
                $this->syncSubjects($combination, array_map(fn ($k) => $this->subjectId($k), $keys), $bam ? [$this->subjectId('BAM')] : []);
                $added++;
            }
        });

        return $added;
    }

    /** Make sure Academic Communication and Historia ya Tanzania na Maadili exist as compulsory subsidiaries. */
    public function ensureCurrentSubsidiaries(): void
    {
        foreach (self::CURRENT_COMPULSORY as $key) {
            $this->subjectId($key); // creates the subject, or gives an uncategorised one its category
        }
        $this->rules->refresh();
    }

    /**
     * @param  array{code:string, name:string, principal_subject_ids:array<int,int|string>, optional_subject_ids?:array<int,int|string>, is_active?:bool, notes?:?string}  $data
     */
    public function save(?Combination $combination, array $data): Combination
    {
        $principal = array_values(array_unique(array_map('intval', $data['principal_subject_ids'])));
        $optional = array_values(array_unique(array_map('intval', $data['optional_subject_ids'] ?? [])));

        $categories = Subject::whereIn('id', [...$principal, ...$optional])->pluck('a_level_category', 'id');
        $wrong = collect($principal)->reject(fn ($id) => ($categories[$id] ?? null) === ALevelRules::PRINCIPAL);
        if ($wrong->isNotEmpty()) {
            $names = Subject::whereIn('id', $wrong)->pluck('name')->implode(', ');
            throw ValidationException::withMessages(['principal_subject_ids' => "{$names} ".($wrong->count() > 1 ? 'are' : 'is').' not a principal subject. Set the A-Level category under Academics → Subjects.']);
        }
        if (collect($optional)->contains(fn ($id) => ($categories[$id] ?? null) !== ALevelRules::OPTIONAL)) {
            throw ValidationException::withMessages(['optional_subject_ids' => 'Only optional subsidiary subjects (e.g. BAM) can be ticked here.']);
        }

        return DB::transaction(function () use ($combination, $data, $principal, $optional) {
            $attributes = [
                'code' => trim($data['code']), // keep the official casing, e.g. HGFa, EBuAc
                'name' => $data['name'],
                'is_active' => (bool) ($data['is_active'] ?? true),
                'notes' => $data['notes'] ?? null,
            ];
            $combination ? $combination->update($attributes) : $combination = Combination::create($attributes);
            $this->syncSubjects($combination, $principal, $optional);

            return $combination;
        });
    }

    /** Rewrite the combination's subjects (principals + optional subsidiaries) and keep its streams' allocations in step. */
    public function syncSubjects(Combination $combination, array $principalIds, array $optionalIds = []): void
    {
        $rows = collect($optionalIds)->mapWithKeys(fn ($id) => [(int) $id => Combination::SUBSIDIARY]);
        foreach ($principalIds as $id) {
            $rows[(int) $id] = Combination::PRINCIPAL;
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
     * Re-apply subject categories everywhere after they change: optional subsidiaries that are no longer optional
     * leave their combinations, and every A-Level stream's allocations are brought in line with its class rules.
     */
    public function refreshAll(): void
    {
        $this->rules->refresh();
        $optional = Subject::where('a_level_category', ALevelRules::OPTIONAL)->pluck('id');

        DB::transaction(function () use ($optional) {
            DB::table('combination_subjects')->where('school_id', app(Tenancy::class)->schoolId())
                ->where('role', Combination::SUBSIDIARY)->whereNotIn('subject_id', $optional->all() ?: [0])->delete();

            $classIds = SchoolClass::where('education_level', EducationLevel::A_LEVEL)->pluck('id');
            foreach (Stream::with('combination.items')->whereIn('school_class_id', $classIds)->whereNotNull('combination_id')->get() as $stream) {
                $this->syncStreamAllocations($stream);
            }
        });
    }

    /**
     * Make the stream's subjects (combination + class compulsory subsidiaries) available for mark entry:
     * one stream-level allocation per subject (teacher assigned later). Allocations for subjects the stream
     * no longer takes are removed unless a teacher is assigned.
     */
    public function syncStreamAllocations(Stream $stream): void
    {
        $stream->loadMissing('combination.items');
        $subjectIds = $stream->combination ? $this->rules->streamEntry($stream)['subjects'] : [];

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

    /** Find (by code or name) or create the school subject for a catalogue key; new subjects get their A-Level category. */
    public function subjectId(string $key): int
    {
        [$name, $code, $aliases, $category] = self::SUBJECTS[$key];

        $subject = Subject::where('code', $code)->first()
            ?? Subject::whereIn(DB::raw('LOWER(name)'), array_map('mb_strtolower', [$name, ...$aliases]))->first()
            ?? Subject::create(['name' => $name, 'code' => $code, 'type' => $category === ALevelRules::PRINCIPAL ? 'elective' : 'core', 'a_level_category' => $category]);

        if (! $subject->a_level_category) {
            $subject->forceFill(['a_level_category' => $category])->save();
        }

        return $subject->id;
    }
}
