<?php

namespace Tests\Feature;

use App\Models\SchoolClass;
use App\Models\Student;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/** SRS 3.2 / 15.2: a tenant cannot view, alter, export or infer another tenant's data. */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_students_from_another_school_cannot_be_read_updated_or_deleted(): void
    {
        ['admin' => $adminA] = $this->makeSchool('School A');
        ['school' => $schoolB] = $this->makeSchool('School B');
        $foreign = $this->makeStudent($schoolB, ['first_name' => 'Secret']);

        $this->actingAs($adminA);

        $this->get("/students/{$foreign->id}")->assertNotFound();
        $this->get("/students/{$foreign->id}/edit")->assertNotFound();
        $this->put("/students/{$foreign->id}", ['first_name' => 'Hacked'])->assertNotFound();
        $this->delete("/students/{$foreign->id}")->assertNotFound();

        $this->assertDatabaseHas('students', ['id' => $foreign->id, 'first_name' => 'Secret', 'deleted_at' => null]);
    }

    public function test_listings_and_exports_only_contain_own_school_records(): void
    {
        ['admin' => $adminA, 'school' => $schoolA] = $this->makeSchool('School A');
        ['school' => $schoolB] = $this->makeSchool('School B');
        $this->makeStudent($schoolA, ['first_name' => 'Mine']);
        $this->makeStudent($schoolB, ['first_name' => 'Theirs']);

        $this->actingAs($adminA)->get('/students')->assertInertia(fn (Assert $page) => $page
            ->component('students/index')
            ->where('students.total', 1)
            ->where('students.data.0.full_name', fn ($name) => str_starts_with($name, 'Mine')));

        $csv = $this->actingAs($adminA)->get('/students/export')->streamedContent();
        $this->assertStringContainsString('Mine', $csv);
        $this->assertStringNotContainsString('Theirs', $csv);
    }

    public function test_cannot_reference_another_schools_class_when_saving(): void
    {
        ['admin' => $adminA] = $this->makeSchool('School A');
        ['school' => $schoolB] = $this->makeSchool('School B');
        $foreignClass = app(Tenancy::class)->runAs($schoolB, fn () => SchoolClass::create(['name' => 'Form Two', 'level' => 2]));

        $this->actingAs($adminA)->post('/students', [
            'first_name' => 'Asha',
            'last_name' => 'Kimaro',
            'gender' => 'female',
            'school_class_id' => $foreignClass->id,
            'residence_type' => 'day',
        ])->assertSessionHasErrors('school_class_id');
    }

    public function test_created_records_are_stamped_with_server_side_school_even_if_spoofed(): void
    {
        ['admin' => $adminA, 'school' => $schoolA] = $this->makeSchool('School A');
        ['school' => $schoolB] = $this->makeSchool('School B');
        $class = app(Tenancy::class)->runAs($schoolA, fn () => SchoolClass::create(['name' => 'Form One', 'level' => 1]));

        $this->actingAs($adminA)->post('/students', [
            'first_name' => 'Juma',
            'last_name' => 'Mrema',
            'gender' => 'male',
            'school_class_id' => $class->id,
            'residence_type' => 'day',
            'school_id' => $schoolB->id,
            'tenant_id' => $schoolB->tenant_id,
            'guardians' => [['first_name' => 'Hamisi', 'last_name' => 'Mrema', 'phone' => '+255700000001', 'relationship' => 'Father', 'is_primary' => true]],
        ])->assertRedirect();

        $student = Student::withoutGlobalScopes()->where('first_name', 'Juma')->firstOrFail();
        $this->assertSame($schoolA->id, $student->school_id);
        $this->assertSame($schoolA->tenant_id, $student->tenant_id);
    }

    public function test_session_cannot_be_used_to_switch_into_another_tenant(): void
    {
        ['admin' => $adminA] = $this->makeSchool('School A');
        ['school' => $schoolB] = $this->makeSchool('School B');
        $foreign = $this->makeStudent($schoolB);

        $this->actingAs($adminA)->post('/switch-school', ['school_id' => $schoolB->id])->assertNotFound();
        $this->withSession(['school_id' => $schoolB->id])->get("/students/{$foreign->id}")->assertNotFound();
    }

    public function test_role_permissions_are_enforced_server_side(): void
    {
        ['school' => $school] = $this->makeSchool();
        $librarian = $this->makeUserWithRole($school, 'librarian');
        $student = $this->makeStudent($school);

        $this->actingAs($librarian)->get('/students')->assertOk();
        $this->actingAs($librarian)->get('/students/create')->assertForbidden();
        $this->actingAs($librarian)->delete("/students/{$student->id}")->assertForbidden();
    }

    public function test_parent_cannot_open_staff_pages(): void
    {
        ['school' => $school] = $this->makeSchool();
        $parent = $this->makeUserWithRole($school, 'parent');

        $this->actingAs($parent)->get('/students')->assertForbidden();
        $this->actingAs($parent)->get('/dashboard')->assertRedirect('/portal');
    }
}
