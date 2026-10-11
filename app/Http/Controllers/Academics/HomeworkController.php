<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\Assignment;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Homework and assignments with attachments (SRS 4.20). */
class HomeworkController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'class' => '', 'subject' => '', 'teacher' => '', 'status' => '', 'due' => ''], $request->only(['search', 'class', 'subject', 'teacher', 'status', 'due']));
        $today = now()->toDateString();

        $assignments = Assignment::with(['schoolClass:id,name', 'stream:id,name', 'subject:id,name,code', 'teacher:id,first_name,last_name'])
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('title', 'like', "%{$v}%")->orWhere('instructions', 'like', "%{$v}%")))
            ->when($filters['class'], fn ($q, $v) => $q->where('school_class_id', $v))
            ->when($filters['subject'], fn ($q, $v) => $q->where('subject_id', $v))
            ->when($filters['teacher'], fn ($q, $v) => $q->where('employee_id', $v))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['due'] === 'upcoming', fn ($q) => $q->whereDate('due_date', '>=', $today))
            ->when($filters['due'] === 'overdue', fn ($q) => $q->whereDate('due_date', '<', $today)->where('status', 'published'))
            ->orderByDesc('due_date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Assignment $a) => [
                'id' => $a->id,
                'school_class_id' => $a->school_class_id,
                'stream_id' => $a->stream_id,
                'subject_id' => $a->subject_id,
                'employee_id' => $a->employee_id,
                'title' => $a->title,
                'instructions' => $a->instructions,
                'due_date' => $a->due_date?->toDateString(),
                'max_score' => $a->max_score,
                'status' => $a->status,
                'attachment_url' => $a->attachment_url,
                'attachment_name' => $a->attachment_path ? basename($a->attachment_path) : null,
                'class' => trim(($a->schoolClass?->name ?? '').' '.($a->stream?->name ?? '')),
                'subject' => $a->subject?->name,
                'teacher' => $a->teacher?->full_name,
                'created_at' => $a->created_at?->toDateTimeString(),
            ]);

        return Inertia::render('academics/homework', [
            'assignments' => $assignments,
            'filters' => $filters,
            'classes' => Lookups::classes(),
            'subjects' => Lookups::subjects(),
            'teachers' => Lookups::teachers(),
            'statuses' => Lookups::enum(Assignment::STATUSES),
            'stats' => [
                'published' => Assignment::where('status', 'published')->count(),
                'due_week' => Assignment::where('status', 'published')->whereBetween('due_date', [$today, now()->addDays(7)->toDateString()])->count(),
                'overdue' => Assignment::where('status', 'published')->whereDate('due_date', '<', $today)->count(),
                'closed' => Assignment::where('status', 'closed')->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $assignment = new Assignment(collect($data)->except(['attachment', 'remove_attachment'])->all());
        if ($request->hasFile('attachment')) {
            $assignment->attachment_path = $request->file('attachment')->store('homework', 'public');
        }
        $assignment->save();

        $this->audit('created', $assignment, "Published homework: {$assignment->title}", 'academics');
        $this->toast('Homework saved.');

        return back();
    }

    public function update(Request $request, Assignment $assignment): RedirectResponse
    {
        $data = $this->validated($request);
        $assignment->fill(collect($data)->except(['attachment', 'remove_attachment'])->all());

        if ($request->hasFile('attachment') || ($data['remove_attachment'] ?? false)) {
            if ($assignment->attachment_path) {
                Storage::disk('public')->delete($assignment->attachment_path);
            }
            $assignment->attachment_path = $request->hasFile('attachment') ? $request->file('attachment')->store('homework', 'public') : null;
        }
        $assignment->save();

        $this->audit('updated', $assignment, "Updated homework: {$assignment->title}", 'academics');
        $this->toast('Homework updated.');

        return back();
    }

    public function destroy(Assignment $assignment): RedirectResponse
    {
        if ($assignment->attachment_path) {
            Storage::disk('public')->delete($assignment->attachment_path);
        }
        $assignment->delete();
        $this->audit('deleted', $assignment, "Deleted homework: {$assignment->title}", 'academics');
        $this->toast('Homework deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'subject_id' => ['required', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'employee_id' => ['nullable', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'title' => ['required', 'string', 'max:200'],
            'instructions' => ['nullable', 'string', 'max:5000'],
            'due_date' => ['required', 'date'],
            'max_score' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'status' => ['required', Rule::in(Assignment::STATUSES)],
            'attachment' => ['nullable', 'file', 'max:10240', 'mimes:pdf,doc,docx,ppt,pptx,xls,xlsx,jpg,jpeg,png,txt,zip'],
            'remove_attachment' => ['boolean'],
        ], [], ['school_class_id' => 'class', 'stream_id' => 'stream', 'subject_id' => 'subject', 'employee_id' => 'teacher']);
    }
}
