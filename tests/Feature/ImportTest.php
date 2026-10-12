<?php

namespace Tests\Feature;

use App\Imports\Spreadsheet;
use App\Models\Employee;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Student;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;
use ZipArchive;

class ImportTest extends TestCase
{
    use RefreshDatabase;

    private $school;

    private $admin;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
        $this->actingAs($this->admin);
    }

    private function csv(string $name, array $rows): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'csv');
        $h = fopen($path, 'w');
        foreach ($rows as $r) {
            fputcsv($h, $r, ',', '"', '');
        }
        fclose($h);

        return new UploadedFile($path, $name, 'text/csv', null, true);
    }

    public function test_template_is_a_readable_xlsx_with_all_columns(): void
    {
        $response = $this->get('/imports/students/template')->assertOk();
        $path = $response->getFile()->getPathname();

        $rows = Spreadsheet::read($path, 'xlsx');
        $this->assertSame('First Name *', $rows[0][1]);
        $this->assertSame('Asha', $rows[1][1]);

        $zip = new ZipArchive;
        $zip->open($path);
        $this->assertStringContainsString('Instructions', $zip->getFromName('xl/workbook.xml'));
        $this->assertStringContainsString('dataValidation', $zip->getFromName('xl/worksheets/sheet1.xml'));
        $zip->close();
    }

    public function test_classes_and_streams_then_students_import_end_to_end(): void
    {
        // Classes (with inline streams) from an xlsx written by our own writer.
        $xlsx = Spreadsheet::writeXlsx(
            [['label' => 'Class Name'], ['label' => 'Code'], ['label' => 'Level'], ['label' => 'Streams']],
            [['Form One', 'F1', 1, 'A, B'], ['Form Two', 'F2', 2, 'A']],
        );
        $preview = $this->post('/imports/classes/preview', ['file' => new UploadedFile($xlsx, 'classes.xlsx', null, null, true)])->assertOk()->json();
        $this->assertSame(2, $preview['counts']['valid']);
        $this->post('/imports/classes/commit', ['token' => $preview['token']])->assertOk()->assertJson(['imported' => 2]);

        app(Tenancy::class)->setSchool($this->school);
        $this->assertSame(3, Stream::count());

        // Students from CSV: one valid, one invalid class, one in-file duplicate, Excel serial + dd/mm/yyyy dates.
        $file = $this->csv('students.csv', [
            ['Admission No', 'First Name', 'Last Name', 'Gender', 'Date of Birth', 'Class', 'Stream', 'Guardian First Name', 'Guardian Phone'],
            ['S-001', 'asha', 'mushi', 'F', '14/03/2012', 'Form One', 'A', 'Mariamu', '+255700000001'],
            ['S-002', 'Juma', 'Ally', 'M', '40983', 'Form Nine', '', '', ''],
            ['S-001', 'Asha', 'Mushi', 'female', '14/03/2012', 'Form One', 'A', '', ''],
        ]);
        $preview = $this->post('/imports/students/preview', ['file' => $file])->assertOk()->json();

        $this->assertSame(['total' => 3, 'valid' => 1, 'invalid' => 1, 'duplicate' => 1], $preview['counts']);
        $this->assertSame(3, $preview['rows'][1]['line']);
        $this->assertStringContainsString('Form Nine', $preview['rows'][1]['errors'][0]);

        $this->post('/imports/students/commit', ['token' => $preview['token']])->assertOk()->assertJson(['imported' => 1, 'skipped' => 2]);

        $student = Student::where('admission_no', 'S-001')->firstOrFail();
        $this->assertSame('Asha', $student->first_name);
        $this->assertSame('2012-03-14', $student->date_of_birth->toDateString());
        $this->assertSame('female', $student->gender);
        $this->assertSame(1, $student->guardians()->count());
        $this->assertSame(1, $student->enrolments()->count());

        // A preview token can only be used once.
        $this->post('/imports/students/commit', ['token' => $preview['token']])->assertStatus(422);
    }

    public function test_missing_required_columns_block_the_import(): void
    {
        $preview = $this->post('/imports/employees/preview', ['file' => $this->csv('e.csv', [['Surname', 'Phone'], ['Temba', '0713']])])->assertOk()->json();
        $this->assertContains('First Name', $preview['missing_required']);
        $this->assertSame(0, $preview['counts']['valid']);
    }

    public function test_employee_import_with_existing_duplicate(): void
    {
        app(Tenancy::class)->setSchool($this->school);
        Employee::create(['employee_no' => 'EMP-9', 'first_name' => 'A', 'last_name' => 'B', 'status' => 'active']);

        $preview = $this->post('/imports/employees/preview', ['file' => $this->csv('e.csv', [
            ['Employee No', 'First Name', 'Last Name', 'Category', 'Basic Salary', 'Hire Date'],
            ['EMP-9', 'Neema', 'Temba', 'teaching', '1,200,000', '01/02/2024'],
            ['', 'Baraka', 'Kimaro', 'non-teaching', '900000', '2024-03-01'],
        ])])->assertOk()->json();

        $this->assertSame(1, $preview['counts']['duplicate']);
        $this->post('/imports/employees/commit', ['token' => $preview['token']])->assertOk()->assertJson(['imported' => 1]);
        $this->assertSame('non_teaching', Employee::where('first_name', 'Baraka')->value('category'));
    }

    public function test_permission_is_enforced(): void
    {
        $librarian = $this->makeUserWithRole($this->school, 'librarian');
        $this->actingAs($librarian)->get('/imports/students/template')->assertForbidden();
        $this->actingAs($librarian)->get('/imports/books/template')->assertOk();
    }
}
