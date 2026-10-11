<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\FeeCategory;
use App\Models\FeeStructure;
use App\Models\Term;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class FeeStructureController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->only(['term', 'class', 'category']);
        $termId = ($filters['term'] ?? '') !== '' ? (int) $filters['term'] : Term::current()?->id;
        $term = $termId ? Term::with('academicYear:id,name')->find($termId) : null;

        $structures = FeeStructure::with(['schoolClass:id,name,level', 'feeCategory:id,name,code'])
            ->when($term, fn ($q) => $q->where('term_id', $term->id))
            ->when($filters['class'] ?? null, fn ($q, $c) => $q->where('school_class_id', $c))
            ->when($filters['category'] ?? null, fn ($q, $c) => $q->where('fee_category_id', $c))
            ->get()
            ->sortBy(fn ($s) => sprintf('%03d-%s-%s-%s', $s->schoolClass?->level ?? 0, $s->schoolClass?->name, $s->feeCategory?->name, $s->residence_type))
            ->values()
            ->map(fn (FeeStructure $s) => [
                'id' => $s->id,
                'academic_year_id' => $s->academic_year_id,
                'term_id' => $s->term_id,
                'school_class_id' => $s->school_class_id,
                'fee_category_id' => $s->fee_category_id,
                'class' => $s->schoolClass?->name,
                'category' => $s->feeCategory?->name,
                'residence_type' => $s->residence_type,
                'amount' => (string) $s->amount,
                'due_date' => $s->due_date?->toDateString(),
            ]);

        $termCounts = FeeStructure::query()->selectRaw('term_id, COUNT(*) as total')->groupBy('term_id')->pluck('total', 'term_id');

        return Inertia::render('fees/structures', [
            'structures' => $structures,
            'term' => $term ? ['id' => $term->id, 'name' => $term->name, 'year' => $term->academicYear?->name, 'academic_year_id' => $term->academic_year_id, 'start_date' => $term->start_date?->toDateString()] : null,
            'filters' => array_merge(['term' => $termId ? (string) $termId : '', 'class' => '', 'category' => ''], array_filter($filters, fn ($v) => $v !== null)),
            'terms' => collect(Lookups::terms())->map(fn ($t) => $t + ['structures' => (int) ($termCounts[$t['value']] ?? 0)])->all(),
            'classes' => Lookups::classes(),
            'categories' => FeeCategory::where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($c) => ['value' => $c->id, 'label' => $c->name]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request, true);
        $term = Term::findOrFail($data['term_id']);
        $created = 0;
        $skipped = 0;

        DB::transaction(function () use ($data, $term, &$created, &$skipped) {
            foreach ($data['school_class_ids'] as $classId) {
                $exists = FeeStructure::where('term_id', $term->id)->where('school_class_id', $classId)
                    ->where('fee_category_id', $data['fee_category_id'])->where('residence_type', $data['residence_type'])->exists();
                if ($exists) {
                    $skipped++;

                    continue;
                }

                FeeStructure::create([
                    'academic_year_id' => $term->academic_year_id,
                    'term_id' => $term->id,
                    'school_class_id' => $classId,
                    'fee_category_id' => $data['fee_category_id'],
                    'residence_type' => $data['residence_type'],
                    'amount' => $data['amount'],
                    'due_date' => $data['due_date'] ?? null,
                ]);
                $created++;
            }
        });

        if ($created === 0) {
            throw ValidationException::withMessages(['school_class_ids' => 'These classes already have this fee for the term and residence type. Edit the existing line instead.']);
        }

        $this->audit('created', null, "Added {$created} fee structure line(s) for {$term->name}", 'fees', null, $data);
        $this->toast("{$created} fee line(s) added".($skipped ? ", {$skipped} already existed" : '').'.');

        return back();
    }

    public function update(Request $request, FeeStructure $structure): RedirectResponse
    {
        $data = $this->validated($request, false);
        $term = Term::findOrFail($data['term_id']);

        $duplicate = FeeStructure::where('term_id', $term->id)->where('school_class_id', $data['school_class_id'])
            ->where('fee_category_id', $data['fee_category_id'])->where('residence_type', $data['residence_type'])
            ->whereKeyNot($structure->id)->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['fee_category_id' => 'Another line already exists for this class, category and residence type.']);
        }

        $old = $structure->only(['amount', 'due_date', 'residence_type', 'fee_category_id', 'school_class_id']);
        $structure->update([
            'academic_year_id' => $term->academic_year_id,
            'term_id' => $term->id,
            'school_class_id' => $data['school_class_id'],
            'fee_category_id' => $data['fee_category_id'],
            'residence_type' => $data['residence_type'],
            'amount' => $data['amount'],
            'due_date' => $data['due_date'] ?? null,
        ]);
        $this->audit('updated', $structure, 'Updated fee structure line', 'fees', $old, $structure->only(array_keys($old)));
        $this->toast('Fee line updated. Already-issued invoices are not changed.');

        return back();
    }

    public function destroy(FeeStructure $structure): RedirectResponse
    {
        $this->audit('deleted', $structure, 'Deleted fee structure line', 'fees', $structure->toArray());
        $structure->delete();
        $this->toast('Fee line removed.');

        return back();
    }

    /** Copy every structure line from one term to another (due dates shift with the term start). */
    public function copy(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'from_term_id' => ['required', Rule::exists('terms', 'id')->where('school_id', $schoolId)],
            'to_term_id' => ['required', 'different:from_term_id', Rule::exists('terms', 'id')->where('school_id', $schoolId)],
            'overwrite' => ['boolean'],
            'adjust_percent' => ['nullable', 'numeric', 'min:-50', 'max:100'],
        ]);

        $from = Term::findOrFail($data['from_term_id']);
        $to = Term::findOrFail($data['to_term_id']);
        $shift = $from->start_date && $to->start_date ? (int) $from->start_date->diffInDays($to->start_date, false) : 0;
        $factor = bcadd('1', bcdiv((string) ($data['adjust_percent'] ?? 0), '100', 4), 4);
        $created = 0;
        $updated = 0;

        DB::transaction(function () use ($from, $to, $shift, $factor, $data, &$created, &$updated) {
            foreach (FeeStructure::where('term_id', $from->id)->get() as $line) {
                $amount = bcadd(bcmul((string) $line->amount, $factor, 4), '0', 2);
                $existing = FeeStructure::where('term_id', $to->id)->where('school_class_id', $line->school_class_id)
                    ->where('fee_category_id', $line->fee_category_id)->where('residence_type', $line->residence_type)->first();
                $due = $line->due_date?->addDays($shift)->toDateString();

                if ($existing) {
                    if (! empty($data['overwrite'])) {
                        $existing->update(['amount' => $amount, 'due_date' => $due]);
                        $updated++;
                    }

                    continue;
                }

                FeeStructure::create([
                    'academic_year_id' => $to->academic_year_id,
                    'term_id' => $to->id,
                    'school_class_id' => $line->school_class_id,
                    'fee_category_id' => $line->fee_category_id,
                    'residence_type' => $line->residence_type,
                    'amount' => $amount,
                    'due_date' => $due,
                ]);
                $created++;
            }
        });

        $this->audit('copied', null, "Copied fee structure from {$from->name} to {$to->name}: {$created} created, {$updated} updated", 'fees');
        $this->toast("Copied: {$created} new line(s)".($updated ? ", {$updated} updated" : '').'.', $created + $updated > 0 ? 'success' : 'info');

        return to_route('fees.structures.index', ['term' => $to->id]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $multi): array
    {
        $schoolId = $this->tenancy()->schoolId();
        $classRule = Rule::exists('school_classes', 'id')->where('school_id', $schoolId);

        return $request->validate([
            'term_id' => ['required', Rule::exists('terms', 'id')->where('school_id', $schoolId)],
            'fee_category_id' => ['required', Rule::exists('fee_categories', 'id')->where('school_id', $schoolId)],
            'residence_type' => ['required', Rule::in(FeeStructure::RESIDENCE_TYPES)],
            'amount' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'due_date' => ['nullable', 'date'],
            ...($multi
                ? ['school_class_ids' => ['required', 'array', 'min:1'], 'school_class_ids.*' => [$classRule]]
                : ['school_class_id' => ['required', $classRule]]),
        ]);
    }
}
