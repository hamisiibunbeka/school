<?php

namespace Tests\Feature;

use App\Models\StudentDocument;
use App\Providers\AppServiceProvider;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StudentDocumentViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_documents_open_for_their_student_only_and_hide_the_storage_path(): void
    {
        Storage::fake();
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        $student = $this->makeStudent($school);
        $other = $this->makeStudent($school);

        $this->actingAs($admin)->post("/students/{$student->id}/documents", [
            'title' => 'Birth certificate',
            'file' => UploadedFile::fake()->create('scan.pdf', 100, 'application/pdf'),
        ])->assertSessionHasNoErrors();
        $doc = app(Tenancy::class)->runAs($school, fn () => StudentDocument::firstOrFail());

        $this->actingAs($admin)->get("/students/{$student->id}/documents/{$doc->id}")
            ->assertOk()
            ->assertHeader('content-disposition', 'inline; filename=birth-certificate.pdf');

        $this->actingAs($admin)->get("/students/{$other->id}/documents/{$doc->id}")->assertNotFound();

        $this->actingAs($admin)->get("/students/{$student->id}")->assertInertia(fn (Assert $p) => $p
            ->where('student.documents.0.title', 'Birth certificate')
            ->missing('student.documents.0.file_path'));

        ['admin' => $intruder] = $this->makeSchool('Other School');
        $this->actingAs($intruder)->get("/students/{$student->id}/documents/{$doc->id}")->assertNotFound();
    }

    public function test_file_rejected_by_php_size_limit_gets_a_clear_message(): void
    {
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        $student = $this->makeStudent($school);

        // What PHP hands Laravel when a file exceeds upload_max_filesize.
        $tmp = tempnam(sys_get_temp_dir(), 'up');
        $tooBig = new UploadedFile($tmp, 'scan.pdf', 'application/pdf', UPLOAD_ERR_INI_SIZE, true);

        $this->actingAs($admin)->post("/students/{$student->id}/documents", ['title' => 'Scan', 'file' => $tooBig])
            ->assertSessionHasErrors(['file' => 'The file could not be uploaded. It is probably larger than the server allows ('.AppServiceProvider::uploadLimitMb().' MB) — try a smaller file or a compressed/scanned-at-lower-quality PDF.']);
    }

    public function test_report_cards_tell_approvers_they_can_publish(): void
    {
        ['admin' => $admin] = $this->makeSchool();

        $this->actingAs($admin)->get('/exams/report-cards')->assertInertia(fn (Assert $p) => $p->component('exams/report-cards')->where('canApprove', true));
    }
}
