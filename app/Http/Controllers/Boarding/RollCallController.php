<?php

namespace App\Http\Controllers\Boarding;

use App\Http\Controllers\Controller;
use App\Models\BedAllocation;
use App\Models\Dormitory;
use App\Models\LeavePass;
use App\Models\RollCall;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class RollCallController extends Controller
{
    public function index(Request $request): Response
    {
        $dormitories = Dormitory::orderBy('name')->get(['id', 'name', 'gender']);
        $date = $request->date('date')?->toDateString() ?? now()->toDateString();
        $session = in_array($request->input('session'), RollCall::SESSIONS, true) ? $request->input('session') : $this->defaultSession();
        $dormitoryId = (int) ($request->input('dormitory') ?: $dormitories->first()?->id);

        $roster = $dormitoryId ? $this->roster($dormitoryId, $date, $session) : collect();

        $history = RollCall::query()
            ->join('dormitories', 'dormitories.id', '=', 'roll_calls.dormitory_id')
            ->where('roll_calls.school_id', $this->tenancy()->schoolId())
            ->selectRaw('roll_calls.dormitory_id, dormitories.name as dormitory, roll_calls.date, roll_calls.session')
            ->selectRaw("SUM(roll_calls.status = 'present') as present, SUM(roll_calls.status = 'absent') as absent, SUM(roll_calls.status = 'on_leave') as on_leave, COUNT(*) as total")
            ->groupBy('roll_calls.dormitory_id', 'dormitories.name', 'roll_calls.date', 'roll_calls.session')
            ->orderByDesc('roll_calls.date')
            ->orderByRaw("FIELD(roll_calls.session, 'night', 'evening', 'morning')")
            ->limit(12)
            ->get()
            ->map(fn ($r) => [
                'id' => "{$r->dormitory_id}-{$r->date}-{$r->session}",
                'dormitory_id' => $r->dormitory_id,
                'dormitory' => $r->dormitory,
                'date' => substr((string) $r->date, 0, 10),
                'session' => $r->session,
                'present' => (int) $r->present,
                'absent' => (int) $r->absent,
                'on_leave' => (int) $r->on_leave,
                'total' => (int) $r->total,
            ]);

        return Inertia::render('boarding/roll-call', [
            'dormitories' => $dormitories->map(fn ($d) => ['value' => $d->id, 'label' => $d->name]),
            'selection' => ['dormitory' => $dormitoryId ?: '', 'date' => $date, 'session' => $session],
            'roster' => $roster->values(),
            'alreadyTaken' => $roster->contains(fn ($r) => $r['recorded']),
            'history' => $history,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'dormitory_id' => ['required', Rule::exists('dormitories', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'session' => ['required', Rule::in(RollCall::SESSIONS)],
            'marks' => ['required', 'array', 'min:1'],
            'marks.*.student_id' => ['required', 'integer'],
            'marks.*.status' => ['required', Rule::in(RollCall::STATUSES)],
        ]);

        // Only students actually allocated to this dormitory on that date can be marked.
        $allowed = $this->roster((int) $data['dormitory_id'], $data['date'], $data['session'])->pluck('student_id')->all();

        $saved = 0;
        DB::transaction(function () use ($data, $allowed, &$saved) {
            foreach ($data['marks'] as $mark) {
                if (! in_array((int) $mark['student_id'], $allowed, true)) {
                    continue;
                }
                RollCall::updateOrCreate(
                    ['student_id' => $mark['student_id'], 'date' => $data['date'], 'session' => $data['session']],
                    ['dormitory_id' => $data['dormitory_id'], 'status' => $mark['status'], 'recorded_by' => auth()->id()],
                );
                $saved++;
            }
        });

        $absent = collect($data['marks'])->where('status', 'absent')->count();
        $dorm = Dormitory::find($data['dormitory_id']);
        $this->audit('roll_call', $dorm, "Roll call {$data['session']} {$data['date']} — {$dorm?->name}: {$saved} marked, {$absent} absent", 'boarding');
        $this->toast("Roll call saved for {$saved} students".($absent ? " — {$absent} absent." : '.'), $absent ? 'warning' : 'success');

        return back();
    }

    /** Students allocated to the dormitory on the date, with existing or default status. */
    private function roster(int $dormitoryId, string $date, string $session): Collection
    {
        $allocations = BedAllocation::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id,photo_path', 'student.schoolClass:id,name', 'student.stream:id,name', 'room:id,name'])
            ->whereHas('room', fn ($q) => $q->where('dormitory_id', $dormitoryId))
            ->whereDate('start_date', '<=', $date)
            ->where(fn ($q) => $q->where('status', 'active')->orWhereDate('end_date', '>=', $date))
            ->get()
            ->filter(fn ($a) => $a->student);

        $studentIds = $allocations->pluck('student_id');

        $existing = RollCall::where('date', $date)->where('session', $session)->whereIn('student_id', $studentIds)->pluck('status', 'student_id');

        // A student with a leave pass that is "out" over this date defaults to on_leave.
        $endOfDay = now()->parse($date)->endOfDay();
        $onLeave = LeavePass::whereIn('student_id', $studentIds)
            ->where('departure_at', '<=', $endOfDay)
            ->where(fn ($q) => $q->where('status', 'out')
                ->orWhere(fn ($q) => $q->where('status', 'returned')->where('returned_at', '>', $endOfDay)))
            ->pluck('student_id')->flip();

        return $allocations
            ->sortBy(fn ($a) => $a->room?->name.'|'.str_pad((string) $a->bed_no, 4, '0', STR_PAD_LEFT).'|'.$a->student->first_name)
            ->map(fn (BedAllocation $a) => [
                'id' => $a->student_id,
                'student_id' => $a->student_id,
                'full_name' => $a->student->full_name,
                'admission_no' => $a->student->admission_no,
                'photo_url' => $a->student->photo_url,
                'class' => trim(($a->student->schoolClass?->name ?? '').' '.($a->student->stream?->name ?? '')),
                'room' => $a->room?->name,
                'bed_no' => $a->bed_no,
                'has_leave_pass' => $onLeave->has($a->student_id),
                'recorded' => $existing->has($a->student_id),
                'status' => $existing[$a->student_id] ?? ($onLeave->has($a->student_id) ? 'on_leave' : 'present'),
            ]);
    }

    private function defaultSession(): string
    {
        $hour = (int) now()->format('H');

        return $hour < 12 ? 'morning' : ($hour < 19 ? 'evening' : 'night');
    }
}
