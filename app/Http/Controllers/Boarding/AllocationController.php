<?php

namespace App\Http\Controllers\Boarding;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\BedAllocation;
use App\Models\Dormitory;
use App\Models\DormitoryRoom;
use App\Models\Student;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AllocationController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'dormitory' => '', 'status' => ''], $request->only(['search', 'dormitory', 'status']));

        $allocations = BedAllocation::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,gender,school_class_id,stream_id,photo_path', 'student.schoolClass:id,name', 'student.stream:id,name', 'room:id,name,dormitory_id', 'room.dormitory:id,name,gender'])
            ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
            ->when($filters['dormitory'], fn ($q, $d) => $q->whereHas('room', fn ($r) => $r->where('dormitory_id', $d)))
            ->when($filters['search'], fn ($q, $s) => $q->whereHas('student', fn ($st) => $st->search($s)))
            ->orderBy('status')
            ->orderBy(DormitoryRoom::select('dormitory_id')->whereColumn('dormitory_rooms.id', 'bed_allocations.dormitory_room_id'))
            ->orderBy('dormitory_room_id')
            ->orderBy('bed_no')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (BedAllocation $a) => [
                'id' => $a->id,
                'student_id' => $a->student_id,
                'student' => $a->student?->full_name,
                'admission_no' => $a->student?->admission_no,
                'photo_url' => $a->student?->photo_url,
                'gender' => $a->student?->gender,
                'class' => trim(($a->student?->schoolClass?->name ?? '').' '.($a->student?->stream?->name ?? '')),
                'dormitory' => $a->room?->dormitory?->name,
                'dormitory_id' => $a->room?->dormitory_id,
                'room' => $a->room?->name,
                'room_id' => $a->dormitory_room_id,
                'bed_no' => $a->bed_no,
                'start_date' => $a->start_date?->toDateString(),
                'end_date' => $a->end_date?->toDateString(),
                'status' => $a->status,
            ]);

        $unallocated = Student::active()
            ->where('residence_type', 'boarding')
            ->whereNotIn('id', BedAllocation::active()->select('student_id'))
            ->with(['schoolClass:id,name', 'stream:id,name'])
            ->orderBy('gender')->orderBy('first_name')
            ->get()
            ->map(fn (Student $s) => [
                'id' => $s->id,
                'full_name' => $s->full_name,
                'admission_no' => $s->admission_no,
                'gender' => $s->gender,
                'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
            ]);

        return Inertia::render('boarding/allocations', [
            'allocations' => $allocations,
            'filters' => $filters,
            'unallocated' => $unallocated,
            'boarders' => Student::active()->where('residence_type', 'boarding')->orderBy('first_name')->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no', 'gender'])
                ->map(fn ($s) => ['value' => $s->id, 'label' => "{$s->full_name} ({$s->admission_no})", 'gender' => $s->gender]),
            'rooms' => $this->roomOptions(),
            'dormitories' => Dormitory::orderBy('name')->get(['id', 'name'])->map(fn ($d) => ['value' => $d->id, 'label' => $d->name]),
            'currentYear' => AcademicYear::current()?->name,
            'stats' => [
                'active' => BedAllocation::active()->count(),
                'unallocated' => $unallocated->count(),
                'capacity' => (int) Dormitory::sum('capacity'),
                'ended' => BedAllocation::where('status', 'ended')->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'dormitory_room_id' => ['required', Rule::exists('dormitory_rooms', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'bed_no' => ['nullable', 'string', 'max:20'],
            'start_date' => ['required', 'date'],
        ]);

        $allocation = DB::transaction(function () use ($data) {
            $student = Student::whereKey($data['student_id'])->lockForUpdate()->firstOrFail();
            $this->assertCanAllocate($student, $data['dormitory_room_id'], $data['bed_no'] ?? null);

            return BedAllocation::create($data + [
                'academic_year_id' => AcademicYear::current()?->id,
                'status' => 'active',
            ]);
        });

        $allocation->load('student', 'room.dormitory');
        $this->audit('allocated', $allocation, "{$allocation->student->full_name} allocated to {$allocation->room->dormitory->name} / {$allocation->room->name}".($allocation->bed_no ? " bed {$allocation->bed_no}" : ''), 'boarding');
        $this->toast('Bed allocated.');

        return back();
    }

    public function end(Request $request, BedAllocation $allocation): RedirectResponse
    {
        $data = $request->validate(['end_date' => ['required', 'date', 'after_or_equal:'.$allocation->start_date->toDateString()], 'reason' => ['nullable', 'string', 'max:255']]);

        if ($allocation->status !== 'active') {
            $this->toast('This allocation has already ended.', 'error');

            return back();
        }

        $allocation->update(['status' => 'ended', 'end_date' => $data['end_date']]);
        $this->audit('ended', $allocation, "Bed allocation ended for {$allocation->student?->full_name}".(! empty($data['reason']) ? ": {$data['reason']}" : ''), 'boarding');
        $this->toast('Allocation ended.');

        return back();
    }

    public function transfer(Request $request, BedAllocation $allocation): RedirectResponse
    {
        $data = $request->validate([
            'dormitory_room_id' => ['required', Rule::exists('dormitory_rooms', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'bed_no' => ['nullable', 'string', 'max:20'],
            'date' => ['required', 'date', 'after_or_equal:'.$allocation->start_date->toDateString()],
        ]);

        if ($allocation->status !== 'active') {
            $this->toast('Only active allocations can be transferred.', 'error');

            return back();
        }

        $new = DB::transaction(function () use ($allocation, $data) {
            $student = Student::whereKey($allocation->student_id)->lockForUpdate()->firstOrFail();
            $allocation->update(['status' => 'ended', 'end_date' => $data['date']]);
            $this->assertCanAllocate($student, (int) $data['dormitory_room_id'], $data['bed_no'] ?? null);

            return BedAllocation::create([
                'student_id' => $student->id,
                'dormitory_room_id' => $data['dormitory_room_id'],
                'bed_no' => $data['bed_no'] ?? null,
                'start_date' => $data['date'],
                'academic_year_id' => AcademicYear::current()?->id,
                'status' => 'active',
            ]);
        });

        $new->load('student', 'room.dormitory');
        $this->audit('transferred', $new, "{$new->student->full_name} transferred to {$new->room->dormitory->name} / {$new->room->name}", 'boarding');
        $this->toast('Student transferred.');

        return back();
    }

    /** Enforce: boarder only, one active allocation, room capacity, bed free, gender policy. */
    private function assertCanAllocate(Student $student, int|string $roomId, ?string $bedNo): void
    {
        if ($student->residence_type !== 'boarding') {
            throw ValidationException::withMessages(['student_id' => "{$student->full_name} is registered as a day student."]);
        }
        if ($student->status !== 'active') {
            throw ValidationException::withMessages(['student_id' => "{$student->full_name} is not an active student."]);
        }
        if (BedAllocation::active()->where('student_id', $student->id)->exists()) {
            throw ValidationException::withMessages(['student_id' => "{$student->full_name} already has an active bed allocation. Transfer instead."]);
        }

        $room = DormitoryRoom::with('dormitory')->whereKey($roomId)->lockForUpdate()->firstOrFail();
        if (! $room->dormitory->accepts($student->gender)) {
            throw ValidationException::withMessages(['dormitory_room_id' => "{$room->dormitory->name} is a ".($room->dormitory->gender === 'male' ? 'boys' : 'girls')." dormitory."]);
        }
        $occupied = $room->activeAllocations()->count();
        if ($occupied >= $room->capacity) {
            throw ValidationException::withMessages(['dormitory_room_id' => "Room {$room->name} is full ({$occupied}/{$room->capacity})."]);
        }
        if ($bedNo && $room->activeAllocations()->where('bed_no', $bedNo)->exists()) {
            throw ValidationException::withMessages(['bed_no' => "Bed {$bedNo} in {$room->name} is already taken."]);
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function roomOptions(): array
    {
        return DormitoryRoom::with('dormitory:id,name,gender')
            ->withCount('activeAllocations')
            ->get()
            ->sortBy(fn ($r) => $r->dormitory?->name.'|'.$r->name)
            ->map(fn (DormitoryRoom $r) => [
                'value' => $r->id,
                'label' => "{$r->dormitory?->name} — {$r->name} ({$r->active_allocations_count}/{$r->capacity})",
                'gender' => $r->dormitory?->gender,
                'free' => max(0, $r->capacity - $r->active_allocations_count),
            ])->values()->all();
    }
}
