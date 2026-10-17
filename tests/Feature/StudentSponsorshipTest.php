<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Sponsor;
use App\Models\Student;
use App\Models\StudentSponsorship;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StudentSponsorshipTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
    }

    private function in(callable $fn): mixed
    {
        return app(Tenancy::class)->runAs($this->school, $fn);
    }

    /** @param  array<string, mixed>  $sponsorship */
    private function admit(array $sponsorship, array $extra = []): TestResponse
    {
        $class = $this->in(fn () => SchoolClass::firstOrCreate(['name' => 'Form One'], ['level' => 1]));

        return $this->actingAs($this->admin)->post('/students', array_merge([
            'first_name' => 'Neema',
            'last_name' => 'Mushi',
            'gender' => 'female',
            'school_class_id' => $class->id,
            'residence_type' => 'boarding',
            'guardians' => [['first_name' => 'Mama', 'last_name' => 'Mushi', 'phone' => '0754000111', 'relationship' => 'Mother', 'is_primary' => true]],
            'sponsorship' => $sponsorship,
        ], $extra));
    }

    private function student(): Student
    {
        return $this->in(fn () => Student::latest('id')->firstOrFail());
    }

    public function test_admission_with_a_new_sponsor(): void
    {
        $this->admit([
            'enabled' => true,
            'sponsor' => ['name' => 'Compassion Tanzania', 'type' => 'ngo', 'contact_person' => 'Mr. Kweka', 'phone' => '0713000222'],
            'coverage' => 'partial', 'percentage' => 60, 'covers' => 'Tuition, Boarding', 'reference' => 'CT-2026-041',
        ])->assertSessionHasNoErrors()->assertRedirect();

        $sp = $this->in(fn () => StudentSponsorship::with('sponsor')->firstOrFail());
        $this->assertSame('Compassion Tanzania', $sp->sponsor->name);
        $this->assertSame('ngo', $sp->sponsor->type);
        $this->assertSame('partial', $sp->coverage);
        $this->assertSame('60.00', (string) $sp->percentage);
        $this->assertSame('active', $sp->status);
        $this->assertSame($this->student()->id, $sp->student_id);
    }

    public function test_existing_sponsor_is_reused_and_names_are_not_duplicated(): void
    {
        $sponsor = $this->in(fn () => Sponsor::create(['name' => 'Lutheran Church Moshi', 'type' => 'religious']));

        $this->admit(['enabled' => true, 'sponsor_id' => $sponsor->id, 'coverage' => 'full'])->assertSessionHasNoErrors();
        $this->admit(['enabled' => true, 'sponsor' => ['name' => 'lutheran church moshi'], 'coverage' => 'full'], ['first_name' => 'Baraka'])->assertSessionHasNoErrors();

        $this->assertSame(1, $this->in(fn () => Sponsor::count()));
        $this->assertSame(2, $this->in(fn () => $sponsor->sponsorships()->count()));
    }

    public function test_validation_and_unsponsored_admission(): void
    {
        $this->admit(['enabled' => true, 'coverage' => 'full'])->assertSessionHasErrors('sponsorship.sponsor.name');
        $this->admit(['enabled' => true, 'sponsor' => ['name' => 'X'], 'coverage' => 'partial'])->assertSessionHasErrors('sponsorship.percentage');

        // Not ticked: no sponsorship, even if leftover fields are sent.
        $this->admit(['enabled' => false, 'sponsor' => ['name' => ''], 'coverage' => 'full'])->assertSessionHasNoErrors();
        $this->assertSame(0, $this->in(fn () => StudentSponsorship::count()));
    }

    public function test_edit_form_updates_switches_and_ends_sponsorship(): void
    {
        $this->admit(['enabled' => true, 'sponsor' => ['name' => 'Sponsor A'], 'coverage' => 'full'])->assertSessionHasNoErrors();
        $student = $this->student();
        $a = $this->in(fn () => Sponsor::where('name', 'Sponsor A')->firstOrFail());
        $base = ['first_name' => 'Neema', 'last_name' => 'Mushi', 'gender' => 'female', 'school_class_id' => $student->school_class_id, 'residence_type' => 'boarding'];

        // Same sponsor → terms updated in place.
        $this->actingAs($this->admin)->put("/students/{$student->id}", $base + ['sponsorship' => ['enabled' => true, 'sponsor_id' => $a->id, 'coverage' => 'partial', 'percentage' => 50]])->assertSessionHasNoErrors();
        $this->assertSame(1, $this->in(fn () => StudentSponsorship::count()));
        $this->assertSame('partial', $this->in(fn () => StudentSponsorship::first()->coverage));

        // Different sponsor → old one ended, new one active.
        $this->actingAs($this->admin)->put("/students/{$student->id}", $base + ['sponsorship' => ['enabled' => true, 'sponsor' => ['name' => 'Sponsor B'], 'coverage' => 'full']])->assertSessionHasNoErrors();
        $this->assertSame(['ended', 'active'], $this->in(fn () => StudentSponsorship::orderBy('id')->pluck('status')->all()));

        // Unticked → current one ended, history kept.
        $this->actingAs($this->admin)->put("/students/{$student->id}", $base + ['sponsorship' => ['enabled' => false]])->assertSessionHasNoErrors();
        $this->assertSame(0, $this->in(fn () => StudentSponsorship::where('status', 'active')->count()));
        $this->assertSame(2, $this->in(fn () => StudentSponsorship::count()));
    }

    public function test_profile_tab_add_edit_end_and_delete(): void
    {
        $student = $this->makeStudent($this->school);

        $this->actingAs($this->admin)->post("/students/{$student->id}/sponsorships", ['sponsor' => ['name' => 'Bakhresa Foundation', 'type' => 'company'], 'coverage' => 'full', 'covers' => 'Tuition'])->assertSessionHasNoErrors();
        $sp = $this->in(fn () => StudentSponsorship::firstOrFail());

        $this->actingAs($this->admin)->put("/sponsorships/{$sp->id}", ['coverage' => 'partial', 'percentage' => 75, 'sponsor' => ['phone' => '0222000333']])->assertSessionHasNoErrors();
        $sp->refresh();
        $this->assertSame('75.00', (string) $sp->percentage);
        $this->assertSame('0222000333', $sp->sponsor->phone);

        $this->actingAs($this->admin)->get("/students/{$student->id}")->assertInertia(fn (Assert $p) => $p
            ->component('students/show')
            ->has('student.sponsorships', 1)
            ->where('student.sponsorships.0.sponsor.name', 'Bakhresa Foundation')
            ->has('sponsors', 1));

        $this->actingAs($this->admin)->post("/sponsorships/{$sp->id}/end", ['end_date' => now()->toDateString()])->assertSessionHasNoErrors();
        $this->assertSame('ended', $sp->fresh()->status);

        $this->actingAs($this->admin)->delete("/sponsorships/{$sp->id}")->assertSessionHasNoErrors();
        $this->assertSame(0, $this->in(fn () => StudentSponsorship::count()));
    }

    public function test_cannot_use_or_touch_another_schools_sponsors(): void
    {
        ['school' => $other] = $this->makeSchool('Other School');
        $foreign = app(Tenancy::class)->runAs($other, fn () => Sponsor::create(['name' => 'Their Sponsor']));
        $theirStudent = $this->makeStudent($other);
        $theirSp = app(Tenancy::class)->runAs($other, fn () => $theirStudent->sponsorships()->create(['sponsor_id' => $foreign->id, 'coverage' => 'full', 'status' => 'active']));

        $this->admit(['enabled' => true, 'sponsor_id' => $foreign->id, 'coverage' => 'full'])->assertSessionHasErrors('sponsorship.sponsor_id');
        $this->actingAs($this->admin)->delete("/sponsorships/{$theirSp->id}")->assertNotFound();
    }

    public function test_attachment_upload_view_replace_remove_and_cleanup(): void
    {
        Storage::fake();

        $this->admit([
            'enabled' => true,
            'sponsor' => ['name' => 'Compassion Tanzania'],
            'coverage' => 'full',
            'attachment' => UploadedFile::fake()->create('agreement.pdf', 200, 'application/pdf'),
        ])->assertSessionHasNoErrors();

        $sp = $this->in(fn () => StudentSponsorship::firstOrFail());
        $this->assertSame('agreement.pdf', $sp->attachment_name);
        Storage::assertExists($first = $sp->attachment_path);
        $this->assertArrayNotHasKey('attachment_path', $sp->toArray(), 'The storage path is never sent to the browser.');

        $this->actingAs($this->admin)->get("/sponsorships/{$sp->id}/attachment")->assertOk()->assertHeader('content-disposition');

        // Replace from the profile tab (multipart PUT via _method).
        $this->actingAs($this->admin)->post("/sponsorships/{$sp->id}", [
            '_method' => 'put', 'coverage' => 'full',
            'attachment' => UploadedFile::fake()->image('award-letter.jpg'),
        ])->assertSessionHasNoErrors();
        $sp->refresh();
        $this->assertSame('award-letter.jpg', $sp->attachment_name);
        Storage::assertMissing($first);
        Storage::assertExists($second = $sp->attachment_path);

        // Remove.
        $this->actingAs($this->admin)->post("/sponsorships/{$sp->id}", ['_method' => 'put', 'coverage' => 'full', 'remove_attachment' => true])->assertSessionHasNoErrors();
        $this->assertNull($sp->fresh()->attachment_name);
        Storage::assertMissing($second);
        $this->actingAs($this->admin)->get("/sponsorships/{$sp->id}/attachment")->assertNotFound();

        // Deleting the sponsorship deletes its file.
        $this->actingAs($this->admin)->post("/sponsorships/{$sp->id}", ['_method' => 'put', 'coverage' => 'full', 'attachment' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')]);
        $third = $sp->fresh()->attachment_path;
        $this->actingAs($this->admin)->delete("/sponsorships/{$sp->id}");
        Storage::assertMissing($third);
    }

    public function test_attachment_is_optional_validated_and_private_to_the_school(): void
    {
        Storage::fake();
        $student = $this->makeStudent($this->school);

        $this->actingAs($this->admin)->post("/students/{$student->id}/sponsorships", ['sponsor' => ['name' => 'No File Sponsor'], 'coverage' => 'full'])->assertSessionHasNoErrors();
        $this->actingAs($this->admin)->post("/students/{$student->id}/sponsorships", [
            'sponsor' => ['name' => 'Bad File'], 'coverage' => 'full', 'attachment' => UploadedFile::fake()->create('virus.exe', 10),
        ])->assertSessionHasErrors('attachment');
        $this->actingAs($this->admin)->post("/students/{$student->id}/sponsorships", [
            'sponsor' => ['name' => 'Big File'], 'coverage' => 'full', 'attachment' => UploadedFile::fake()->create('huge.pdf', 6000, 'application/pdf'),
        ])->assertSessionHasErrors('attachment');

        $this->actingAs($this->admin)->post("/students/{$student->id}/sponsorships", [
            'sponsor' => ['name' => 'With File'], 'coverage' => 'full', 'attachment' => UploadedFile::fake()->create('letter.pdf', 50, 'application/pdf'),
        ])->assertSessionHasNoErrors();
        $sp = $this->in(fn () => StudentSponsorship::whereNotNull('attachment_name')->firstOrFail());

        ['admin' => $intruder] = $this->makeSchool('Other School');
        $this->actingAs($intruder)->get("/sponsorships/{$sp->id}/attachment")->assertNotFound();
    }
}
