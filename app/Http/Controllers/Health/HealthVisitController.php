<?php

namespace App\Http\Controllers\Health;

use App\Http\Controllers\Controller;
use App\Models\HealthVisit;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** School clinic visits (SRS 4.17). Restricted to health.view / health.manage. */
class HealthVisitController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'referred' => '', 'from' => '', 'to' => ''], $request->only(['search', 'referred', 'from', 'to']));

        $visits = HealthVisit::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id,photo_path,residence_type', 'student.schoolClass:id,name', 'student.stream:id,name', 'recorder:id,name'])
            ->when($filters['referred'] === 'yes', fn ($q) => $q->whereNotNull('referred_to')->where('referred_to', '!=', ''))
            ->when($filters['referred'] === 'no', fn ($q) => $q->where(fn ($q) => $q->whereNull('referred_to')->orWhere('referred_to', '')))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('visited_at', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('visited_at', '<=', $d))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('complaint', 'like', "%{$s}%")->orWhereHas('student', fn ($st) => $st->search($s))))
            ->orderByDesc('visited_at')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (HealthVisit $v) => [
                'id' => $v->id,
                'student_id' => $v->student_id,
                'student' => $v->student?->full_name,
                'admission_no' => $v->student?->admission_no,
                'photo_url' => $v->student?->photo_url,
                'class' => trim(($v->student?->schoolClass?->name ?? '').' '.($v->student?->stream?->name ?? '')),
                'residence_type' => $v->student?->residence_type,
                'visited_at' => $v->visited_at?->format('Y-m-d\TH:i'),
                'complaint' => $v->complaint,
                'treatment' => $v->treatment,
                'referred_to' => $v->referred_to,
                'guardian_notified' => $v->guardian_notified,
                'recorded_by' => $v->recorder?->name,
            ]);

        $topComplaints = HealthVisit::query()
            ->where('visited_at', '>=', now()->subDays(90))
            ->select('complaint', DB::raw('COUNT(*) as total'))
            ->groupBy('complaint')
            ->orderByDesc('total')
            ->limit(6)
            ->get()
            ->map(fn ($r) => ['complaint' => $r->complaint, 'total' => (int) $r->total]);

        return Inertia::render('health/visits', [
            'visits' => $visits,
            'filters' => $filters,
            'students' => Student::active()->orderBy('first_name')->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no'])
                ->map(fn ($s) => ['value' => $s->id, 'label' => "{$s->full_name} ({$s->admission_no})"]),
            'topComplaints' => $topComplaints,
            'stats' => [
                'today' => HealthVisit::whereDate('visited_at', now()->toDateString())->count(),
                'month' => HealthVisit::where('visited_at', '>=', now()->startOfMonth())->count(),
                'referrals' => HealthVisit::where('visited_at', '>=', now()->startOfMonth())->whereNotNull('referred_to')->where('referred_to', '!=', '')->count(),
                'not_notified' => HealthVisit::where('guardian_notified', false)->where('visited_at', '>=', now()->subDays(30))->count(),
                'allergies' => Student::active()->whereNotNull('allergies')->where('allergies', '!=', '')->count(),
            ],
        ]);
    }

    /** JSON: health profile shown when a student is selected on the visit form. */
    public function studentProfile(Student $student): JsonResponse
    {
        $student->load(['schoolClass:id,name', 'stream:id,name', 'guardians:id,first_name,last_name,phone']);
        $guardian = $student->guardians->firstWhere('pivot.is_primary', true) ?? $student->guardians->first();

        return response()->json([
            'id' => $student->id,
            'full_name' => $student->full_name,
            'admission_no' => $student->admission_no,
            'class' => trim(($student->schoolClass?->name ?? '').' '.($student->stream?->name ?? '')),
            'gender' => $student->gender,
            'date_of_birth' => $student->date_of_birth?->toDateString(),
            'residence_type' => $student->residence_type,
            'blood_group' => $student->blood_group,
            'allergies' => $student->allergies,
            'medical_notes' => $student->medical_notes,
            'guardian' => $guardian?->full_name,
            'guardian_phone' => $guardian?->phone,
            'visits_count' => HealthVisit::where('student_id', $student->id)->count(),
            'recent' => HealthVisit::where('student_id', $student->id)->orderByDesc('visited_at')->limit(3)->get(['id', 'visited_at', 'complaint'])
                ->map(fn ($v) => ['id' => $v->id, 'visited_at' => $v->visited_at?->format('Y-m-d\TH:i'), 'complaint' => $v->complaint]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $visit = HealthVisit::create($this->validated($request) + ['recorded_by' => auth()->id()]);
        // Sensitive record: audit without clinical details.
        $this->audit('created', $visit, "Clinic visit recorded for {$visit->student?->full_name}", 'health');
        $this->toast('Clinic visit recorded.');

        return back();
    }

    public function update(Request $request, HealthVisit $visit): RedirectResponse
    {
        $visit->update($this->validated($request));
        $this->audit('updated', $visit, "Clinic visit #{$visit->id} updated for {$visit->student?->full_name}", 'health');
        $this->toast('Clinic visit updated.');

        return back();
    }

    public function destroy(HealthVisit $visit): RedirectResponse
    {
        $this->audit('deleted', $visit, "Clinic visit #{$visit->id} deleted for {$visit->student?->full_name}", 'health');
        $visit->delete();
        $this->toast('Clinic visit deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'visited_at' => ['required', 'date'],
            'complaint' => ['required', 'string', 'max:255'],
            'treatment' => ['nullable', 'string', 'max:5000'],
            'referred_to' => ['nullable', 'string', 'max:255'],
            'guardian_notified' => ['boolean'],
        ]);
        $data['guardian_notified'] = (bool) ($data['guardian_notified'] ?? false);

        return $data;
    }
}
