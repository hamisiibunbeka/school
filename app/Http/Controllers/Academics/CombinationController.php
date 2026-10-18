<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\Combination;
use App\Models\Subject;
use App\Services\Academics\CombinationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** A-Level subject combinations (tahasusi). */
class CombinationController extends Controller
{
    public function __construct(private CombinationService $combinations) {}

    public function index(): Response
    {
        $schoolId = $this->tenancy()->schoolId();
        $students = DB::table('students')->join('streams', 'streams.id', '=', 'students.stream_id')
            ->where('students.school_id', $schoolId)->where('students.status', 'active')->whereNull('students.deleted_at')
            ->whereNotNull('streams.combination_id')
            ->selectRaw('streams.combination_id, COUNT(*) as total')->groupBy('streams.combination_id')->pluck('total', 'combination_id');

        $gs = Subject::where('code', 'GS')->value('id');
        $bam = Subject::where('code', 'BAM')->value('id');

        return Inertia::render('academics/combinations', [
            'combinations' => Combination::with(['items.subject:id,name,code', 'streams.schoolClass:id,name'])->orderBy('code')->get()
                ->map(fn (Combination $c) => [
                    'id' => $c->id,
                    'code' => $c->code,
                    'name' => $c->name,
                    'requires_bam' => $c->requires_bam,
                    'is_active' => $c->is_active,
                    'notes' => $c->notes,
                    'principal' => $c->items->where('role', Combination::PRINCIPAL)->map(fn ($i) => ['id' => $i->subject_id, 'name' => $i->subject?->name, 'code' => $i->subject?->code])->values(),
                    'subsidiary' => $c->items->where('role', Combination::SUBSIDIARY)->map(fn ($i) => ['id' => $i->subject_id, 'name' => $i->subject?->name, 'code' => $i->subject?->code])->values(),
                    'streams' => $c->streams->map(fn ($s) => trim(($s->schoolClass?->name ?? '').' '.$s->name))->values(),
                    'students' => (int) ($students[$c->id] ?? 0),
                ]),
            // Principal subjects: anything except the two subsidiaries.
            'subjects' => Subject::orderBy('name')->get(['id', 'name', 'code'])
                ->reject(fn ($s) => in_array($s->id, [$gs, $bam], true))
                ->map(fn ($s) => ['value' => $s->id, 'label' => $s->code ? "{$s->name} ({$s->code})" : $s->name])->values(),
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
        $this->toast($added ? "{$added} standard combinations added. Review which ones require BAM." : 'All standard combinations already exist.', $added ? 'success' : 'info');

        return back();
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
            'requires_bam' => ['boolean'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [
            'principal_subject_ids.size' => 'A combination has exactly 3 principal subjects.',
            'principal_subject_ids.*.distinct' => 'Choose three different principal subjects.',
            'code.regex' => 'Use letters only, e.g. PCM or HGFa.',
        ], ['principal_subject_ids' => 'principal subjects']);
    }
}
