<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Classes and streams with class teachers and enrolment counts (SRS 4.6). */
class ClassController extends Controller
{
    public function index(): Response
    {
        $schoolId = $this->tenancy()->schoolId();

        $byClass = DB::table('students')->where('students.school_id', $schoolId)->where('status', 'active')->whereNull('deleted_at')
            ->selectRaw('school_class_id, gender, COUNT(*) as total')->groupBy('school_class_id', 'gender')->get()->groupBy('school_class_id');
        $byStream = DB::table('students')->where('students.school_id', $schoolId)->where('status', 'active')->whereNull('deleted_at')
            ->selectRaw('stream_id, COUNT(*) as total')->groupBy('stream_id')->pluck('total', 'stream_id');
        $subjects = DB::table('class_subjects')->where('class_subjects.school_id', $schoolId)
            ->selectRaw('school_class_id, COUNT(DISTINCT subject_id) as total')->groupBy('school_class_id')->pluck('total', 'school_class_id');

        $classes = SchoolClass::with(['streams.classTeacher:id,first_name,last_name'])->orderBy('level')->orderBy('name')->get()
            ->map(function (SchoolClass $c) use ($byClass, $byStream, $subjects) {
                $rows = $byClass[$c->id] ?? collect();

                return [
                    'id' => $c->id,
                    'name' => $c->name,
                    'code' => $c->code,
                    'level' => $c->level,
                    'capacity' => $c->capacity,
                    'students' => (int) $rows->sum('total'),
                    'boys' => (int) $rows->where('gender', 'male')->sum('total'),
                    'girls' => (int) $rows->where('gender', 'female')->sum('total'),
                    'subjects' => (int) ($subjects[$c->id] ?? 0),
                    'streams' => $c->streams->map(fn (Stream $s) => [
                        'id' => $s->id,
                        'name' => $s->name,
                        'capacity' => $s->capacity,
                        'class_teacher_id' => $s->class_teacher_id,
                        'class_teacher' => $s->classTeacher?->full_name,
                        'students' => (int) ($byStream[$s->id] ?? 0),
                    ])->values(),
                ];
            });

        return Inertia::render('academics/classes', [
            'classes' => $classes,
            'teachers' => Lookups::teachers(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validateClass($request);
        $class = DB::transaction(function () use ($data) {
            $class = SchoolClass::create(collect($data)->except('streams')->all());
            foreach (array_filter(array_map('trim', explode(',', (string) ($data['streams'] ?? '')))) as $name) {
                $class->streams()->create(['name' => $name, 'capacity' => $class->capacity ? (int) ceil($class->capacity / max(1, count(explode(',', $data['streams'])))) : null]);
            }

            return $class;
        });

        $this->audit('created', $class, "Created class {$class->name}", 'academics');
        $this->toast("{$class->name} created.");

        return back();
    }

    public function update(Request $request, SchoolClass $class): RedirectResponse
    {
        $data = $this->validateClass($request, $class);
        $old = $class->only(['name', 'code', 'level', 'capacity']);
        $class->update(collect($data)->except('streams')->all());

        $this->audit('updated', $class, "Updated class {$class->name}", 'academics', $old, $class->only(array_keys($old)));
        $this->toast('Class updated.');

        return back();
    }

    public function destroy(SchoolClass $class): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $used = $class->students()->withTrashed()->exists()
            || DB::table('enrolments')->where('enrolments.school_id', $schoolId)->where('school_class_id', $class->id)->exists()
            || DB::table('exam_marks')->where('exam_marks.school_id', $schoolId)->where('school_class_id', $class->id)->exists();

        if ($used) {
            $this->toast("{$class->name} has students or academic history and cannot be deleted.", 'error');

            return back();
        }

        $class->delete();
        $this->audit('deleted', $class, "Deleted class {$class->name}", 'academics');
        $this->toast('Class deleted.');

        return back();
    }

    public function storeStream(Request $request, SchoolClass $class): RedirectResponse
    {
        $data = $this->validateStream($request, $class);
        $stream = $class->streams()->create($data);

        $this->audit('created', $stream, "Added stream {$class->name} {$stream->name}", 'academics');
        $this->toast("Stream {$stream->name} added to {$class->name}.");

        return back();
    }

    public function updateStream(Request $request, Stream $stream): RedirectResponse
    {
        $data = $this->validateStream($request, $stream->schoolClass, $stream);
        $old = $stream->only(['name', 'capacity', 'class_teacher_id']);
        $stream->update($data);

        $this->audit('updated', $stream, "Updated stream {$stream->schoolClass?->name} {$stream->name}", 'academics', $old, $stream->only(array_keys($old)));
        $this->toast('Stream updated.');

        return back();
    }

    public function destroyStream(Stream $stream): RedirectResponse
    {
        if ($stream->students()->withTrashed()->exists()) {
            $this->toast('Move the students out of this stream before deleting it.', 'error');

            return back();
        }

        $stream->delete();
        $this->audit('deleted', $stream, "Deleted stream {$stream->name}", 'academics');
        $this->toast('Stream deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validateClass(Request $request, ?SchoolClass $class = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('school_classes')->where('school_id', $schoolId)->ignore($class?->id)],
            'code' => ['nullable', 'string', 'max:20'],
            'level' => ['required', 'integer', 'min:1', 'max:20'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:2000'],
            'streams' => ['nullable', 'string', 'max:100'],
        ]);
    }

    /** @return array<string, mixed> */
    private function validateStream(Request $request, SchoolClass $class, ?Stream $stream = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:40', Rule::unique('streams')->where('school_id', $schoolId)->where('school_class_id', $class->id)->ignore($stream?->id)],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:500'],
            'class_teacher_id' => ['nullable', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
        ], [], ['class_teacher_id' => 'class teacher']);
    }
}
