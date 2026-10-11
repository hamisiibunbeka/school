<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_years', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_current')->default(false);
            $table->timestamps();
        });

        Schema::create('terms', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_current')->default(false);
            $table->timestamps();
        });

        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('code')->nullable();
            $table->timestamps();
        });

        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('employee_no');
            $table->string('first_name');
            $table->string('last_name');
            $table->string('gender', 10)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('national_id')->nullable();
            $table->string('address')->nullable();
            $table->string('designation')->nullable(); // Teacher, Bursar, Driver ...
            $table->string('category')->default('teaching'); // teaching | non_teaching
            $table->string('employment_type')->default('permanent'); // permanent | contract | part_time
            $table->date('hire_date')->nullable();
            $table->date('contract_end_date')->nullable();
            $table->decimal('basic_salary', 15, 2)->default(0);
            $table->string('bank_name')->nullable();
            $table->string('bank_account')->nullable();
            $table->string('nssf_no')->nullable();
            $table->string('tin')->nullable();
            $table->string('qualification')->nullable();
            $table->string('emergency_contact')->nullable();
            $table->string('status')->default('active'); // active | on_leave | suspended | terminated
            $table->timestamps();
            $table->unique(['school_id', 'employee_no']);
        });

        Schema::create('school_classes', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name'); // Form One, Standard 5 ...
            $table->string('code')->nullable();
            $table->unsignedSmallInteger('level')->default(1); // ordering / promotion sequence
            $table->unsignedSmallInteger('capacity')->nullable();
            $table->timestamps();
        });

        Schema::create('streams', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->string('name'); // A, B, Blue ...
            $table->foreignId('class_teacher_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->unsignedSmallInteger('capacity')->nullable();
            $table->timestamps();
        });

        Schema::create('subjects', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('code')->nullable();
            $table->string('type')->default('core'); // core | elective
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        // Subject offered in a class + teacher assignment
        Schema::create('class_subjects', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stream_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('periods_per_week')->nullable();
            $table->timestamps();
        });

        Schema::create('grade_scales', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('grade', 5);
            $table->decimal('min_score', 5, 2);
            $table->decimal('max_score', 5, 2);
            $table->decimal('points', 4, 1)->default(0);
            $table->string('remark')->nullable();
            $table->timestamps();
        });

        Schema::create('timetable_slots', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stream_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('day_of_week'); // 1 = Monday
            $table->time('start_time');
            $table->time('end_time');
            $table->string('room')->nullable();
            $table->timestamps();
        });

        Schema::create('guardians', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('gender', 10)->nullable();
            $table->string('phone');
            $table->string('alt_phone')->nullable();
            $table->string('email')->nullable();
            $table->string('occupation')->nullable();
            $table->string('national_id')->nullable();
            $table->string('address')->nullable();
            $table->string('preferred_channel')->default('sms'); // sms | email | whatsapp
            $table->timestamps();
        });

        Schema::create('students', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('admission_no');
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('gender', 10);
            $table->date('date_of_birth')->nullable();
            $table->string('photo_path')->nullable();
            $table->string('nationality')->default('Tanzanian');
            $table->string('religion')->nullable();
            $table->string('birth_cert_no')->nullable();
            $table->string('address')->nullable();
            $table->foreignId('school_class_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('stream_id')->nullable()->constrained()->nullOnDelete();
            $table->string('residence_type')->default('day'); // day | boarding
            $table->date('admission_date')->nullable();
            $table->string('previous_school')->nullable();
            $table->text('medical_notes')->nullable();
            $table->string('allergies')->nullable();
            $table->string('blood_group', 5)->nullable();
            $table->string('status')->default('active'); // active | on_leave | suspended | transferred | graduated | withdrawn | archived
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['school_id', 'admission_no']);
            $table->index(['school_id', 'school_class_id', 'status']);
        });

        Schema::create('guardian_student', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guardian_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->string('relationship')->default('Parent'); // Father | Mother | Guardian | Sponsor ...
            $table->boolean('is_primary')->default(false);
            $table->boolean('can_pickup')->default(true);
            $table->boolean('receives_reports')->default(true);
            $table->timestamps();
            $table->unique(['guardian_id', 'student_id']);
        });

        Schema::create('enrolments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stream_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('active'); // active | promoted | repeated | graduated | transferred | withdrawn
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('student_documents', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('file_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('discipline_cases', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->date('incident_date');
            $table->string('type')->default('misconduct'); // misconduct | award | commendation
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('action_taken')->nullable();
            $table->string('status')->default('open'); // open | resolved
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('admission_applications', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('application_no');
            $table->foreignId('academic_year_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('school_class_id')->nullable()->constrained()->nullOnDelete();
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('gender', 10);
            $table->date('date_of_birth')->nullable();
            $table->string('residence_type')->default('day');
            $table->string('previous_school')->nullable();
            $table->string('guardian_name');
            $table->string('guardian_relationship')->default('Parent');
            $table->string('guardian_phone');
            $table->string('guardian_email')->nullable();
            $table->string('address')->nullable();
            $table->text('medical_notes')->nullable();
            $table->text('notes')->nullable();
            $table->date('interview_date')->nullable();
            $table->decimal('assessment_score', 5, 2)->nullable();
            $table->string('status')->default('submitted'); // submitted | under_review | interview | accepted | waitlisted | rejected | enrolled | withdrawn
            $table->text('decision_notes')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->foreignId('student_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'application_no']);
        });

        Schema::create('attendance_records', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stream_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date');
            $table->string('status'); // present | absent | late | excused
            $table->string('remarks')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['student_id', 'date']);
            $table->index(['school_id', 'date']);
        });

        Schema::create('staff_attendances', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('status'); // present | absent | late | on_leave
            $table->time('check_in')->nullable();
            $table->time('check_out')->nullable();
            $table->string('remarks')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['employee_id', 'date']);
        });

        Schema::create('exams', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('term_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('type')->default('end_of_term'); // test | midterm | end_of_term | mock | national
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->decimal('max_score', 6, 2)->default(100);
            $table->decimal('weight', 5, 2)->default(100); // % contribution to term result
            $table->string('status')->default('draft'); // draft | marks_entry | moderation | published
            $table->timestamp('published_at')->nullable();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('exam_classes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->unique(['exam_id', 'school_class_id']);
        });

        Schema::create('exam_marks', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->decimal('score', 6, 2)->nullable();
            $table->boolean('is_absent')->default(false);
            $table->string('grade', 5)->nullable();
            $table->decimal('points', 4, 1)->nullable();
            $table->string('remarks')->nullable();
            $table->foreignId('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['exam_id', 'student_id', 'subject_id']);
        });

        Schema::create('assignments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stream_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->text('instructions')->nullable();
            $table->date('due_date')->nullable();
            $table->decimal('max_score', 6, 2)->nullable();
            $table->string('attachment_path')->nullable();
            $table->string('status')->default('published'); // draft | published | closed
            $table->timestamps();
        });

        Schema::create('lesson_plans', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('term_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('week')->nullable();
            $table->string('topic');
            $table->string('sub_topic')->nullable();
            $table->text('objectives')->nullable();
            $table->text('activities')->nullable();
            $table->string('status')->default('planned'); // planned | taught | skipped
            $table->timestamps();
        });

        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('type')->default('event'); // holiday | exam | meeting | sports | trip | event | deadline
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->boolean('all_day')->default(true);
            $table->string('audience')->default('all'); // all | staff | parents | students
            $table->string('location')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'events', 'lesson_plans', 'assignments', 'exam_marks', 'exam_classes', 'exams',
            'staff_attendances', 'attendance_records', 'admission_applications', 'discipline_cases',
            'student_documents', 'enrolments', 'guardian_student', 'students', 'guardians',
            'timetable_slots', 'grade_scales', 'class_subjects', 'subjects', 'streams',
            'school_classes', 'employees', 'departments', 'terms', 'academic_years',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
