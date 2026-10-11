<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\ClassSubject;
use App\Models\Employee;
use App\Models\SchoolClass;
use App\Models\TimetableSlot;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Weekly timetable per class/stream or teacher with conflict detection (SRS 4.6). */
class TimetableController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['class' => '', 'stream' => '', 'teacher' => ''], $request->only(['class', 'stream', 'teacher']));

        // Default to the first class/stream so the page never opens empty.
        if (! $filters['teacher'] && ! $filters['class']) {
            $first = SchoolClass::with('streams')->orderBy('level')->orderBy('name')->first();
            $filters['class'] = (string) ($first?->id ?? '');
            $filters['stream'] = (string) ($first?->streams->first()?->id ?? '');
        }

        $query = TimetableSlot::with(['subject:id,name,code', 'teacher:id,first_name,last_name', 'schoolClass:id,name', 'stream:id,name']);

        if ($filters['teacher']) {
            $query->where('employee_id', $filters['teacher']);
        } else {
            $query->where('school_class_id', $filters['class'])
                ->when($filters['stream'], fn ($q, $v) => $q->where(fn ($q) => $q->where('stream_id', $v)->orWhereNull('stream_id')));
        }

        $slots = $query->orderBy('day_of_week')->orderBy('start_time')->get()->map(fn (TimetableSlot $s) => [
            'id' => $s->id,
            'school_class_id' => $s->school_class_id,
            'stream_id' => $s->stream_id,
            'subject_id' => $s->subject_id,
            'employee_id' => $s->employee_id,
            'day_of_week' => $s->day_of_week,
            'start_time' => substr((string) $s->start_time, 0, 5),
            'end_time' => substr((string) $s->end_time, 0, 5),
            'room' => $s->room,
            'subject' => $s->subject?->name,
            'subject_code' => $s->subject?->code,
            'teacher' => $s->teacher?->full_name,
            'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
        ]);

        // Period rows come from every distinct slot time used in the school, so all grids line up.
        $periods = TimetableSlot::query()->select(['start_time', 'end_time'])->distinct()->orderBy('start_time')->get()
            ->map(fn ($p) => ['start' => substr((string) $p->start_time, 0, 5), 'end' => substr((string) $p->end_time, 0, 5)])
            ->unique(fn ($p) => $p['start'].'-'.$p['end'])->values();

        // Allocated subjects/teachers per class so the slot form can pre-fill the teacher.
        $allocations = ClassSubject::get(['school_class_id', 'stream_id', 'subject_id', 'employee_id'])
            ->map(fn ($a) => $a->only(['school_class_id', 'stream_id', 'subject_id', 'employee_id']))->values();

        $teacher = $filters['teacher'] ? Employee::find($filters['teacher']) : null;

        return Inertia::render('academics/timetable', [
            'filters' => $filters,
            'slots' => $slots,
            'periods' => $periods,
            'classes' => Lookups::classes(),
            'subjects' => Lookups::subjects(),
            'teachers' => Lookups::teachers(),
            'allocations' => $allocations,
            'teacherName' => $teacher?->full_name,
            'stats' => [
                'slots' => TimetableSlot::count(),
                'teachers' => TimetableSlot::whereNotNull('employee_id')->distinct()->count('employee_id'),
                'rooms' => TimetableSlot::whereNotNull('room')->distinct()->count('room'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $slot = TimetableSlot::create($data);

        $this->audit('created', $slot, 'Added timetable slot '.TimetableSlot::DAYS[$slot->day_of_week]." {$data['start_time']}", 'academics');
        $this->toast('Lesson added to the timetable.');

        return back();
    }

    public function update(Request $request, TimetableSlot $slot): RedirectResponse
    {
        $data = $this->validated($request, $slot);
        $old = $slot->only(['subject_id', 'employee_id', 'day_of_week', 'start_time', 'end_time', 'room']);
        $slot->update($data);

        $this->audit('updated', $slot, 'Updated timetable slot', 'academics', $old, $slot->only(array_keys($old)));
        $this->toast('Timetable slot updated.');

        return back();
    }

    public function destroy(TimetableSlot $slot): RedirectResponse
    {
        $slot->delete();
        $this->audit('deleted', $slot, 'Removed timetable slot', 'academics');
        $this->toast('Lesson removed from the timetable.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?TimetableSlot $slot = null): array
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'subject_id' => ['required', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'employee_id' => ['nullable', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'day_of_week' => ['required', 'integer', 'between:1,5'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'after:start_time'],
            'room' => ['nullable', 'string', 'max:40'],
        ], [], ['school_class_id' => 'class', 'stream_id' => 'stream', 'subject_id' => 'subject', 'employee_id' => 'teacher', 'day_of_week' => 'day']);

        $this->detectConflicts($data, $slot);

        return $data;
    }

    /**
     * Rejects a slot that overlaps another lesson for the same class/stream,
     * the same teacher or the same room on the same day.
     *
     * @param  array<string, mixed>  $data
     */
    private function detectConflicts(array $data, ?TimetableSlot $slot): void
    {
        $overlapping = fn () => TimetableSlot::with(['subject:id,name', 'schoolClass:id,name', 'stream:id,name', 'teacher:id,first_name,last_name'])
            ->where('day_of_week', $data['day_of_week'])
            ->where('start_time', '<', $data['end_time'])
            ->where('end_time', '>', $data['start_time'])
            ->when($slot, fn ($q) => $q->whereKeyNot($slot->id));

        $describe = fn (TimetableSlot $s) => sprintf('%s (%s %s, %s–%s)', $s->subject?->name, $s->schoolClass?->name, $s->stream?->name ?? '', substr((string) $s->start_time, 0, 5), substr((string) $s->end_time, 0, 5));

        $errors = [];

        $classClash = $overlapping()->where('school_class_id', $data['school_class_id'])
            ->where(fn ($q) => empty($data['stream_id'])
                ? $q->whereRaw('1 = 1')
                : $q->where('stream_id', $data['stream_id'])->orWhereNull('stream_id'))
            ->first();
        if ($classClash) {
            $errors['start_time'] = 'This class already has '.$describe($classClash).' at that time.';
        }

        if (! empty($data['employee_id'])) {
            $teacherClash = $overlapping()->where('employee_id', $data['employee_id'])->first();
            if ($teacherClash) {
                $errors['employee_id'] = ($teacherClash->teacher?->full_name ?? 'The teacher').' is already teaching '.$describe($teacherClash).'.';
            }
        }

        if (! empty($data['room'])) {
            $roomClash = $overlapping()->where('room', $data['room'])->first();
            if ($roomClash) {
                $errors['room'] = "Room {$data['room']} is already booked for ".$describe($roomClash).'.';
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }
}
