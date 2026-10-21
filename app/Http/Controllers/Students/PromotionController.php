<?php

namespace App\Http\Controllers\Students;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Enrolment;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Services\Academics\CombinationService;
use App\Support\EducationLevel;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** End-of-year class promotion / repetition / graduation with history (SRS 4.6). */
class PromotionController extends Controller
{
    public function index(Request $request): Response
    {
        $classId = $request->integer('class') ?: null;
        $class = $classId ? SchoolClass::find($classId) : null;
        // Promotion stays within a level: Form IV leavers enter Form V through selection/admission.
        $next = $class ? SchoolClass::where('level', '>', $class->level)->where('education_level', $class->education_level)->orderBy('level')->first() : null;

        return Inertia::render('students/promotions', [
            'classes' => Lookups::classes(),
            'years' => Lookups::academicYears(),
            'selectedClass' => $classId,
            'suggestedNextClass' => $next?->id,
            'students' => $class
                ? Student::active()->where('school_class_id', $class->id)->with('stream:id,name')->orderBy('first_name')->get()
                    ->map(fn ($s) => ['id' => $s->id, 'admission_no' => $s->admission_no, 'full_name' => $s->full_name, 'stream' => $s->stream?->name, 'stream_id' => $s->stream_id])
                : [],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'from_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'to_class_id' => ['nullable', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'academic_year_id' => ['required', Rule::exists('academic_years', 'id')->where('school_id', $schoolId)],
            'decisions' => ['required', 'array', 'min:1'],
            'decisions.*.student_id' => ['required', 'integer'],
            'decisions.*.action' => ['required', Rule::in(['promote', 'repeat', 'graduate'])],
        ]);

        if (! $data['to_class_id'] && collect($data['decisions'])->contains('action', 'promote')) {
            return back()->withErrors(['to_class_id' => 'Choose the class students are being promoted to.']);
        }

        $from = SchoolClass::findOrFail($data['from_class_id']);
        $to = $data['to_class_id'] ? SchoolClass::find($data['to_class_id']) : null;
        if ($to && $to->education_level !== $from->education_level && collect($data['decisions'])->contains('action', 'promote')) {
            return back()->withErrors(['to_class_id' => "Students cannot be promoted from {$from->name} into {$to->name}: A-Level (Form V) places come through Form Five selection or admission. Graduate Form IV students instead."]);
        }
        $yearLevel = AcademicYear::whereKey($data['academic_year_id'])->value('education_level');
        $targetLevel = ($to ?? $from)->education_level;
        if ($yearLevel !== $targetLevel) {
            return back()->withErrors(['academic_year_id' => 'Choose an '.EducationLevel::label($targetLevel).' academic year for these students.']);
        }

        $year = AcademicYear::findOrFail($data['academic_year_id']);
        $counts = ['promote' => 0, 'repeat' => 0, 'graduate' => 0];

        DB::transaction(function () use ($data, $year, &$counts) {
            foreach ($data['decisions'] as $decision) {
                $student = Student::where('school_class_id', $data['from_class_id'])->find($decision['student_id']);
                if (! $student) {
                    continue;
                }

                $student->enrolments()->where('status', 'active')->update([
                    'status' => $decision['action'] === 'promote' ? 'promoted' : ($decision['action'] === 'repeat' ? 'repeated' : 'graduated'),
                    'end_date' => now()->toDateString(),
                ]);

                if ($decision['action'] === 'graduate') {
                    $student->update(['status' => 'graduated']);
                } else {
                    $toClass = $decision['action'] === 'promote' ? $data['to_class_id'] : $data['from_class_id'];
                    $student->update(['school_class_id' => $toClass, 'stream_id' => $decision['action'] === 'repeat' ? $student->stream_id : null]);

                    Enrolment::create([
                        'student_id' => $student->id,
                        'academic_year_id' => $year->id,
                        'school_class_id' => $toClass,
                        'stream_id' => $student->stream_id,
                        'status' => 'active',
                        'start_date' => $year->start_date,
                    ]);
                }

                $counts[$decision['action']]++;
            }

            // A-Level: the promoted cohort keeps its rules, e.g. the first new-system Form Five takes the
            // new rules into Form Six while the old Form Six graduates.
            $to = $data['to_class_id'] ? SchoolClass::find($data['to_class_id']) : null;
            if ($counts['promote'] > 0 && $to?->isALevel()) {
                $to->forceFill(['a_level_rules' => SchoolClass::find($data['from_class_id'])?->a_level_rules])->save();
                app(CombinationService::class)->refreshAll(); // the class's subsidiaries may have changed
            }
        });

        $this->audit('promotion', null, "Promotion run: {$counts['promote']} promoted, {$counts['repeat']} repeated, {$counts['graduate']} graduated", 'students');
        $this->toast("Done: {$counts['promote']} promoted, {$counts['repeat']} repeating, {$counts['graduate']} graduated.");

        return to_route('students.promotions', ['class' => $data['to_class_id'] ?? $data['from_class_id']]);
    }
}
