<?php

namespace App\Http\Controllers\Boarding;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\VisitorLog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class VisitorController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'date' => ''], $request->only(['search', 'status', 'date']));

        $visitors = VisitorLog::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no', 'recorder:id,name'])
            ->when($filters['status'] === 'in', fn ($q) => $q->whereNull('check_out'))
            ->when($filters['status'] === 'out', fn ($q) => $q->whereNotNull('check_out'))
            ->when($filters['date'], fn ($q, $d) => $q->whereDate('check_in', $d))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('visitor_name', 'like', "%{$s}%")
                ->orWhere('phone', 'like', "%{$s}%")->orWhere('id_number', 'like', "%{$s}%")->orWhere('purpose', 'like', "%{$s}%")
                ->orWhereHas('student', fn ($st) => $st->search($s))))
            ->orderByRaw('check_out IS NULL DESC')
            ->orderByDesc('check_in')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (VisitorLog $v) => [
                'id' => $v->id,
                'visitor_name' => $v->visitor_name,
                'phone' => $v->phone,
                'id_number' => $v->id_number,
                'student' => $v->student?->full_name,
                'admission_no' => $v->student?->admission_no,
                'purpose' => $v->purpose,
                'check_in' => $v->check_in?->format('Y-m-d\TH:i'),
                'check_out' => $v->check_out?->format('Y-m-d\TH:i'),
                'recorded_by' => $v->recorder?->name,
            ]);

        return Inertia::render('boarding/visitors', [
            'visitors' => $visitors,
            'filters' => $filters,
            'students' => Student::active()->orderBy('first_name')->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no'])
                ->map(fn ($s) => ['value' => $s->id, 'label' => "{$s->full_name} ({$s->admission_no})"]),
            'stats' => [
                'on_premises' => VisitorLog::whereNull('check_out')->count(),
                'today' => VisitorLog::whereDate('check_in', now()->toDateString())->count(),
                'week' => VisitorLog::where('check_in', '>=', now()->startOfWeek())->count(),
                'month' => VisitorLog::where('check_in', '>=', now()->startOfMonth())->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'visitor_name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:20'],
            'id_number' => ['nullable', 'string', 'max:40'],
            'student_id' => ['nullable', Rule::exists('students', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'purpose' => ['required', 'string', 'max:255'],
            'check_in' => ['nullable', 'date'],
        ]);

        $visit = VisitorLog::create(array_merge($data, ['check_in' => $data['check_in'] ?? now(), 'recorded_by' => auth()->id()]));
        $this->audit('check_in', $visit, "Visitor {$visit->visitor_name} checked in", 'boarding');
        $this->toast('Visitor checked in.');

        return back();
    }

    public function checkOut(VisitorLog $visitor): RedirectResponse
    {
        if ($visitor->check_out) {
            $this->toast('Visitor already checked out.', 'info');

            return back();
        }

        $visitor->update(['check_out' => now()]);
        $this->audit('check_out', $visitor, "Visitor {$visitor->visitor_name} checked out", 'boarding');
        $this->toast('Visitor checked out.');

        return back();
    }

    public function destroy(VisitorLog $visitor): RedirectResponse
    {
        $this->audit('deleted', $visitor, "Visitor log for {$visitor->visitor_name} deleted", 'boarding');
        $visitor->delete();
        $this->toast('Visitor entry deleted.');

        return back();
    }
}
