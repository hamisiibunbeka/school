<?php

namespace App\Http\Controllers\Boarding;

use App\Http\Controllers\Controller;
use App\Models\LeavePass;
use App\Models\Student;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Weekend / home leave (exeat) workflow:
 * pending → approved | rejected → out (departure recorded) → returned.
 */
class LeavePassController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => ''], $request->only(['search', 'status']));

        $passes = LeavePass::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id,photo_path', 'student.schoolClass:id,name', 'student.stream:id,name', 'approver:id,name'])
            ->when($filters['status'] === 'overdue', fn ($q) => $q->overdue())
            ->when($filters['status'] && $filters['status'] !== 'overdue', fn ($q) => $q->where('status', $filters['status']))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->whereHas('student', fn ($st) => $st->search($s))->orWhere('pickup_person', 'like', "%{$s}%")))
            ->orderByRaw("FIELD(status, 'out', 'pending', 'approved', 'returned', 'rejected')")
            ->orderByDesc('departure_at')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (LeavePass $p) => [
                'id' => $p->id,
                'student_id' => $p->student_id,
                'student' => $p->student?->full_name,
                'admission_no' => $p->student?->admission_no,
                'photo_url' => $p->student?->photo_url,
                'class' => trim(($p->student?->schoolClass?->name ?? '').' '.($p->student?->stream?->name ?? '')),
                'reason' => $p->reason,
                'departure_at' => $p->departure_at?->format('Y-m-d\TH:i'),
                'expected_return_at' => $p->expected_return_at?->format('Y-m-d\TH:i'),
                'returned_at' => $p->returned_at?->format('Y-m-d\TH:i'),
                'pickup_person' => $p->pickup_person,
                'pickup_phone' => $p->pickup_phone,
                'status' => $p->status,
                'is_overdue' => $p->is_overdue,
                'approved_by' => $p->approver?->name,
            ]);

        return Inertia::render('boarding/leave-passes', [
            'passes' => $passes,
            'filters' => $filters,
            'students' => Student::active()->where('residence_type', 'boarding')
                ->with(['guardians:id,first_name,last_name,phone'])
                ->orderBy('first_name')
                ->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no'])
                ->map(function ($s) {
                    $g = $s->guardians->firstWhere('pivot.is_primary', true) ?? $s->guardians->first();

                    return ['value' => $s->id, 'label' => "{$s->full_name} ({$s->admission_no})", 'guardian' => $g?->full_name, 'guardian_phone' => $g?->phone];
                }),
            'stats' => [
                'pending' => LeavePass::where('status', 'pending')->count(),
                'approved' => LeavePass::where('status', 'approved')->count(),
                'out' => LeavePass::where('status', 'out')->count(),
                'overdue' => LeavePass::overdue()->count(),
                'returned_month' => LeavePass::where('status', 'returned')->where('returned_at', '>=', now()->startOfMonth())->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $pass = LeavePass::create($this->validated($request) + ['status' => 'pending']);
        $this->audit('created', $pass, "Leave pass requested for {$pass->student?->full_name}", 'boarding');
        $this->toast('Leave request recorded and awaiting approval.');

        return back();
    }

    public function update(Request $request, LeavePass $leavePass): RedirectResponse
    {
        if (! in_array($leavePass->status, ['pending', 'approved'], true)) {
            $this->toast('Only pending or approved passes can be edited.', 'error');

            return back();
        }

        $data = $this->validated($request);
        $old = $leavePass->only(array_keys($data));
        $leavePass->update($data);
        $this->audit('updated', $leavePass, "Leave pass updated for {$leavePass->student?->full_name}", 'boarding', $old, $data);
        $this->toast('Leave pass updated.');

        return back();
    }

    public function approve(LeavePass $leavePass): RedirectResponse
    {
        return $this->transition($leavePass, ['pending'], ['status' => 'approved', 'approved_by' => auth()->id()], 'approved', 'Leave pass approved.');
    }

    public function reject(Request $request, LeavePass $leavePass): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        return $this->transition($leavePass, ['pending', 'approved'], ['status' => 'rejected', 'approved_by' => auth()->id()], 'rejected', 'Leave pass rejected.', $data['reason']);
    }

    /** Student has physically left with the authorised pickup person. */
    public function depart(Request $request, LeavePass $leavePass): RedirectResponse
    {
        $data = $request->validate([
            'departure_at' => ['nullable', 'date'],
            'pickup_person' => ['nullable', 'string', 'max:120'],
            'pickup_phone' => ['nullable', 'string', 'max:20'],
        ]);

        $changes = ['status' => 'out', 'departure_at' => $data['departure_at'] ?? now()];
        if (! empty($data['pickup_person'])) {
            $changes['pickup_person'] = $data['pickup_person'];
        }
        if (! empty($data['pickup_phone'])) {
            $changes['pickup_phone'] = $data['pickup_phone'];
        }

        return $this->transition($leavePass, ['approved'], $changes, 'departed', 'Departure recorded.');
    }

    public function markReturned(Request $request, LeavePass $leavePass): RedirectResponse
    {
        $data = $request->validate(['returned_at' => ['nullable', 'date']]);
        $returnedAt = $data['returned_at'] ?? now();
        $late = now()->parse($returnedAt)->gt($leavePass->expected_return_at);

        return $this->transition($leavePass, ['out'], ['status' => 'returned', 'returned_at' => $returnedAt], 'returned', $late ? 'Return recorded (late return).' : 'Return recorded.', $late ? 'Returned after expected time' : null);
    }

    public function destroy(LeavePass $leavePass): RedirectResponse
    {
        if (! in_array($leavePass->status, ['pending', 'rejected'], true)) {
            $this->toast('Only pending or rejected passes can be deleted.', 'error');

            return back();
        }

        $this->audit('deleted', $leavePass, "Leave pass deleted for {$leavePass->student?->full_name}", 'boarding');
        $leavePass->delete();
        $this->toast('Leave pass deleted.');

        return back();
    }

    /**
     * @param  array<int, string>  $from
     * @param  array<string, mixed>  $changes
     */
    private function transition(LeavePass $pass, array $from, array $changes, string $action, string $message, ?string $note = null): RedirectResponse
    {
        if (! in_array($pass->status, $from, true)) {
            $this->toast("This pass is {$pass->status} and cannot be {$action}.", 'error');

            return back();
        }

        $old = ['status' => $pass->status];
        $pass->update($changes);
        $this->audit($action, $pass, "Leave pass {$action} for {$pass->student?->full_name}".($note ? " — {$note}" : ''), 'boarding', $old, ['status' => $pass->status]);
        $this->toast($message, $note && $action === 'returned' ? 'warning' : 'success');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $this->tenancy()->schoolId())->where('residence_type', 'boarding')],
            'reason' => ['required', 'string', 'max:255'],
            'departure_at' => ['required', 'date'],
            'expected_return_at' => ['required', 'date', 'after:departure_at'],
            'pickup_person' => ['required', 'string', 'max:120'],
            'pickup_phone' => ['required', 'string', 'max:20'],
        ], ['student_id.exists' => 'Leave passes are for boarding students only.']);
    }
}
