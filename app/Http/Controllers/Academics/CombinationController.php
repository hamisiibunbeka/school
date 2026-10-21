<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\Combination;
use App\Models\SchoolClass;
use App\Models\Subject;
use App\Services\Academics\ALevelRules;
use App\Services\Academics\CombinationService;
use App\Support\EducationLevel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** A-Level subject combinations (tahasusi) and the A-Level rules each class follows. */
class CombinationController extends Controller
{
    public function __construct(private CombinationService $combinations, private ALevelRules $rules) {}

    public function index(): Response
    {
        $schoolId = $this->tenancy()->schoolId();
        $students = DB::table('students')->join('streams', 'streams.id', '=', 'students.stream_id')
            ->where('students.school_id', $schoolId)->where('students.status', 'active')->whereNull('students.deleted_at')
            ->whereNotNull('streams.combination_id')
            ->selectRaw('streams.combination_id, COUNT(*) as total')->groupBy('streams.combination_id')->pluck('total', 'combination_id');

        $subjects = Subject::orderBy('name')->get(['id', 'name', 'code', 'a_level_category']);
        $ref = fn ($id) => ($s = $subjects->firstWhere('id', $id)) ? ['id' => $s->id, 'name' => $s->name, 'code' => $s->code] : ['id' => $id, 'name' => 'Removed subject', 'code' => null];
        $option = fn (Subject $s) => ['value' => $s->id, 'label' => $s->code ? "{$s->name} ({$s->code})" : $s->name];

        $classStudents = DB::table('students')->where('school_id', $schoolId)->where('status', 'active')->whereNull('deleted_at')
            ->selectRaw('school_class_id, COUNT(*) as total')->groupBy('school_class_id')->pluck('total', 'school_class_id');
        $current = $this->rules->current();

        return Inertia::render('academics/combinations', [
            'combinations' => Combination::with(['items', 'streams.schoolClass:id,name'])->orderBy('code')->get()
                ->map(fn (Combination $c) => [
                    'id' => $c->id,
                    'code' => $c->code,
                    'name' => $c->name,
                    'is_active' => $c->is_active,
                    'notes' => $c->notes,
                    'principal' => collect($c->principalIds())->map($ref)->values(),
                    'optional' => collect($c->optionalIds())->map($ref)->values(),
                    'streams' => $c->streams->map(fn ($s) => trim(($s->schoolClass?->name ?? '').' '.$s->name))->values(),
                    'students' => (int) ($students[$c->id] ?? 0),
                ]),
            'principalSubjects' => $subjects->where('a_level_category', ALevelRules::PRINCIPAL)->map($option)->values(),
            'optionalSubjects' => $subjects->where('a_level_category', ALevelRules::OPTIONAL)->map($option)->values(),
            'current' => ['compulsory' => collect($current['compulsory'])->map($ref)->values(), 'average' => $current['average']],
            'classes' => SchoolClass::where('education_level', EducationLevel::A_LEVEL)->orderBy('level')->get()
                ->map(function (SchoolClass $class) use ($ref, $classStudents) {
                    $r = $this->rules->forClass($class);

                    return [
                        'id' => $class->id,
                        'name' => $class->name,
                        'pinned' => $r['pinned'],
                        'label' => $r['label'],
                        'compulsory' => collect($r['compulsory'])->map($ref)->values(),
                        'average' => $r['average'],
                        'students' => (int) ($classStudents[$class->id] ?? 0),
                    ];
                })->values(),
            // Offer the one-click switch while the current rules lack the new compulsory subsidiaries.
            'newSystemReady' => collect(CombinationService::CURRENT_COMPULSORY)->every(fn ($code) => $subjects->contains(fn ($s) => $s->code === $code && $s->a_level_category === ALevelRules::COMPULSORY)),
            'standardCount' => count(CombinationService::STANDARD),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $combination = $this->combinations->save(null, $this->validated($request));
        $this->audit('created', $combination, "Created combination {$combination->code}", 'academics');
        $this->toast("Combination {$combination->code} created.");

        return back();
    }

    public function update(Request $request, Combination $combination): RedirectResponse
    {
        $this->combinations->save($combination, $this->validated($request, $combination));
        $this->audit('updated', $combination, "Updated combination {$combination->code}", 'academics');
        $this->toast("Combination {$combination->code} saved.");

        return back();
    }

    public function destroy(Combination $combination): RedirectResponse
    {
        if ($combination->streams()->exists()) {
            $this->toast("{$combination->code} is used by a stream. Unlink it from the stream or deactivate it instead.", 'error');

            return back();
        }

        $this->audit('deleted', $combination, "Deleted combination {$combination->code}", 'academics');
        $combination->delete();
        $this->toast('Combination deleted.');

        return back();
    }

    public function seedStandard(): RedirectResponse
    {
        $added = $this->combinations->seedStandard();
        $this->audit('seeded', null, "Added {$added} standard A-Level combinations", 'academics');
        $this->toast($added ? "{$added} standard combinations added. Review which ones take BAM." : 'All standard combinations already exist.', $added ? 'success' : 'info');

        return back();
    }

    /**
     * Switch to the current ACSEE system: Academic Communication and Historia ya Tanzania na Maadili become the
     * compulsory subsidiaries, General Studies is retired and the average counts all subjects — for the chosen
     * classes (the new intake). Other classes keep the rules they have now until their students leave.
     */
    public function adoptNewSystem(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'class_ids' => ['required', 'array', 'min:1'],
            'class_ids.*' => [Rule::exists('school_classes', 'id')->where('school_id', $schoolId)->where('education_level', EducationLevel::A_LEVEL)],
        ], ['class_ids.required' => 'Choose the class(es) starting the new system — usually Form Five.']);
        $chosen = array_map('intval', $data['class_ids']);

        DB::transaction(function () use ($chosen) {
            $classes = SchoolClass::where('education_level', EducationLevel::A_LEVEL)->get();
            foreach ($classes->whereNotIn('id', $chosen) as $class) {
                if (! $this->rules->forClass($class)['pinned']) {
                    $this->rules->pin($class, 'Old system (General Studies)');
                }
            }

            $this->combinations->ensureCurrentSubsidiaries();
            Subject::where('code', 'GS')->where('a_level_category', ALevelRules::COMPULSORY)->update(['a_level_category' => null]);
            $this->saveAverage(ALevelRules::AVERAGE_ALL);

            foreach ($classes->whereIn('id', $chosen) as $class) {
                $this->rules->follow($class);
            }
            $this->combinations->refreshAll();
        });

        $names = SchoolClass::whereIn('id', $chosen)->orderBy('level')->pluck('name')->implode(', ');
        $this->audit('a_level_rules', null, "Adopted the new A-Level system (Academic Communication, Historia ya Tanzania na Maadili; average of all subjects) for {$names}", 'academics');
        $this->toast("{$names} now follow the new A-Level system. Other A-Level classes keep their current rules.");

        return back();
    }

    /** What the A-Level average counts under the current rules. */
    public function updateAverage(Request $request): RedirectResponse
    {
        $data = $request->validate(['average' => ['required', Rule::in([ALevelRules::AVERAGE_ALL, ALevelRules::AVERAGE_PRINCIPAL])]]);
        $this->saveAverage($data['average']);
        $this->audit('a_level_rules', null, 'A-Level average now counts '.($data['average'] === ALevelRules::AVERAGE_ALL ? 'all subjects' : 'principal subjects only'), 'academics');
        $this->toast('A-Level average rule saved. Published results are not affected.');

        return back();
    }

    /** Let a class follow the current rules, or keep (pin) the rules it uses now. */
    public function classRules(Request $request, SchoolClass $class): RedirectResponse
    {
        abort_unless($class->isALevel(), 404);
        $data = $request->validate(['mode' => ['required', Rule::in(['current', 'keep'])]]);

        $data['mode'] === 'current' ? $this->rules->follow($class) : $this->rules->pin($class);
        $this->combinations->refreshAll();

        $this->audit('a_level_rules', $class, $data['mode'] === 'current' ? "{$class->name} now follows the current A-Level rules" : "{$class->name} keeps its current A-Level rules", 'academics');
        $this->toast($data['mode'] === 'current' ? "{$class->name} follows the current rules." : "{$class->name} will keep its present rules.");

        return back();
    }

    private function saveAverage(string $average): void
    {
        $school = $this->tenancy()->school();
        $settings = $school->settings ?? [];
        $settings[ALevelRules::AVERAGE_SETTING] = $average;
        $school->forceFill(['settings' => $settings])->save();
        $this->rules->refresh();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Combination $combination = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'code' => ['required', 'string', 'max:20', 'regex:/^[A-Za-z]+$/', Rule::unique('combinations')->where('school_id', $schoolId)->ignore($combination?->id)],
            'name' => ['required', 'string', 'max:150'],
            'principal_subject_ids' => ['required', 'array', 'size:3'],
            'principal_subject_ids.*' => ['distinct', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'optional_subject_ids' => ['nullable', 'array'],
            'optional_subject_ids.*' => ['distinct', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [
            'principal_subject_ids.size' => 'A combination has exactly 3 principal subjects.',
            'principal_subject_ids.*.distinct' => 'Choose three different principal subjects.',
            'code.regex' => 'Use letters only, e.g. PCM or HGFa.',
        ], ['principal_subject_ids' => 'principal subjects']);
    }
}
