<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\Enrolment;
use App\Models\FeeCategory;
use App\Models\FeeInstallment;
use App\Models\FeePaymentAgreement;
use App\Models\FeeStructure;
use App\Models\Invoice;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\User;
use App\Services\Fees\AdmissionClearanceService;
use App\Services\Fees\PaymentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdmissionFeeClearanceTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    private SchoolClass $class;

    private AcademicYear $year;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();

        // Two terms of 600,000 each: 1,200,000 a year for Form One.
        $this->in(function () {
            $this->class = SchoolClass::firstOrCreate(['name' => 'Form One'], ['level' => 1]);
            $this->year = AcademicYear::current();
            $category = FeeCategory::create(['name' => 'Tuition']);
            foreach ($this->year->terms as $term) {
                FeeStructure::create(['academic_year_id' => $this->year->id, 'term_id' => $term->id, 'school_class_id' => $this->class->id, 'fee_category_id' => $category->id, 'residence_type' => 'all', 'amount' => 600000]);
            }
        });
    }

    private function in(callable $fn): mixed
    {
        return app(Tenancy::class)->runAs($this->school, $fn);
    }

    private function installments(array $percents = [40, 30, 30]): void
    {
        $this->in(function () use ($percents) {
            foreach ($percents as $i => $p) {
                FeeInstallment::create(['academic_year_id' => $this->year->id, 'sequence' => $i + 1, 'name' => 'Installment '.($i + 1), 'percent' => $p, 'due_date' => $this->year->start_date->addMonths($i * 3)]);
            }
        });
    }

    private function acceptedApplication(): AdmissionApplication
    {
        return $this->in(function () {
            $a = new AdmissionApplication([
                'academic_year_id' => $this->year->id, 'school_class_id' => $this->class->id,
                'first_name' => 'Neema', 'last_name' => 'Mushi', 'gender' => 'female', 'date_of_birth' => '2012-03-04',
                'residence_type' => 'day', 'guardian_name' => 'Mama Mushi', 'guardian_relationship' => 'Mother', 'guardian_phone' => '0754000111',
            ]);
            $a->application_no = 'APP-'.fake()->unique()->numberBetween(100, 9999);
            $a->status = 'accepted';
            $a->save();

            return $a;
        });
    }

    private function enrol(AdmissionApplication $a): AdmissionApplication
    {
        $this->actingAs($this->admin)->post("/admissions/{$a->id}/enrol", ['school_class_id' => $this->class->id, 'admission_date' => today()->toDateString()])
            ->assertSessionHasNoErrors()->assertRedirect("/admissions/{$a->id}");

        return $this->in(fn () => $a->fresh(['student', 'admissionInvoice']));
    }

    private function pay(Student $student, int $amount): void
    {
        $this->actingAs($this->admin);
        $this->in(fn () => app(PaymentService::class)->receive(['student_id' => $student->id, 'amount' => $amount, 'method' => 'cash', 'payment_date' => today()->toDateString()]));
    }

    public function test_enrolment_bills_the_student_and_holds_them_out_of_the_directory(): void
    {
        $this->installments();
        $a = $this->enrol($this->acceptedApplication());

        $this->assertSame('awaiting_fees', $a->status);
        $this->assertSame(Student::PENDING_CLEARANCE, $a->student->status);
        $this->assertSame('600000.00', (string) $a->admissionInvoice->total);
        $this->assertFalse($this->in(fn () => Enrolment::where('student_id', $a->student_id)->exists()));

        $this->get('/students')->assertInertia(fn (Assert $p) => $p->where('students.total', 0));

        // The first installment is 40% of the year's 1,200,000.
        $status = $this->in(fn () => app(AdmissionClearanceService::class)->status($a));
        $this->assertSame('480000.00', $status['required']);
        $this->assertFalse($status['ready']);
        $this->assertCount(3, $status['schedule']);
    }

    public function test_finance_verifies_only_once_the_first_installment_is_paid(): void
    {
        $this->installments();
        $a = $this->enrol($this->acceptedApplication());

        $this->pay($a->student, 300000);
        $this->post("/fees/clearance/{$a->id}/verify")->assertSessionHasErrors('clearance');
        $this->assertSame('awaiting_fees', $this->in(fn () => $a->fresh()->status));

        $this->pay($a->student, 180000);
        $this->post("/fees/clearance/{$a->id}/verify")->assertSessionHasNoErrors();

        $a = $this->in(fn () => $a->fresh('student'));
        $this->assertSame('enrolled', $a->status);
        $this->assertSame('paid', $a->fee_clearance);
        $this->assertSame('active', $a->student->status);
        $this->assertTrue($this->in(fn () => Enrolment::where('student_id', $a->student_id)->where('academic_year_id', $this->year->id)->exists()));
        $this->get('/students')->assertInertia(fn (Assert $p) => $p->where('students.total', 1));
    }

    public function test_without_installment_settings_the_whole_admission_invoice_is_required(): void
    {
        $a = $this->enrol($this->acceptedApplication());

        $status = $this->in(fn () => app(AdmissionClearanceService::class)->status($a));
        $this->assertSame('600000.00', $status['required']);
    }

    public function test_only_holders_of_the_deferral_authority_may_authorize_an_agreement(): void
    {
        $this->installments();
        $a = $this->enrol($this->acceptedApplication());
        $payload = ['amount' => 480000, 'due_date' => today()->addDays(20)->toDateString(), 'reason' => 'Awaiting harvest sales', 'terms' => 'Half by mid-month'];

        $bursar = $this->makeUserWithRole($this->school, 'bursar');
        $this->actingAs($bursar)->post("/fees/clearance/{$a->id}/defer", $payload)->assertForbidden();

        $principal = $this->makeUserWithRole($this->school, 'principal');
        $this->actingAs($principal)->post("/fees/clearance/{$a->id}/defer", $payload)->assertSessionHasNoErrors();

        $a = $this->in(fn () => $a->fresh(['student', 'agreement']));
        $this->assertSame('enrolled', $a->status);
        $this->assertSame('deferred', $a->fee_clearance);
        $this->assertSame('active', $a->student->status);
        $this->assertSame('active', $a->agreement->status);
        $this->assertSame($principal->id, $a->agreement->authorized_by);
        $this->assertSame('Awaiting harvest sales', $a->agreement->reason);

        // Finance (the bursar) is told about the new agreement.
        $this->assertSame(1, $bursar->notifications()->count());
    }

    public function test_paying_the_agreed_amount_honours_the_agreement(): void
    {
        $this->installments();
        $a = $this->enrol($this->acceptedApplication());
        $this->pay($a->student, 100000); // paid before the agreement: not counted towards it

        $this->actingAs($this->admin)->post("/fees/clearance/{$a->id}/defer", ['amount' => 380000, 'due_date' => today()->addDays(10)->toDateString(), 'reason' => 'Salary delayed'])->assertSessionHasNoErrors();
        $agreement = $this->in(fn () => FeePaymentAgreement::firstOrFail());

        $this->pay($a->student, 200000);
        $this->assertSame('active', $this->in(fn () => $agreement->fresh()->status));

        $this->pay($a->student, 180000);
        $agreement = $this->in(fn () => $agreement->fresh());
        $this->assertSame('honoured', $agreement->status);
        $this->assertNotNull($agreement->settled_at);
    }

    public function test_follow_up_notifies_finance_when_an_agreement_is_due_soon_and_when_overdue(): void
    {
        $this->installments();
        $a = $this->enrol($this->acceptedApplication());
        $bursar = $this->makeUserWithRole($this->school, 'bursar');
        $this->actingAs($this->admin)->post("/fees/clearance/{$a->id}/defer", ['amount' => 480000, 'due_date' => today()->addDays(2)->toDateString(), 'reason' => 'Awaiting loan'])->assertSessionHasNoErrors();
        $bursar->notifications()->delete();

        $service = fn () => $this->in(fn () => app(AdmissionClearanceService::class)->followUp());

        $this->assertSame(1, $service()['due_soon']);
        $this->assertSame(0, $service()['due_soon'], 'due-soon notice is sent once');
        $this->assertSame(1, $bursar->notifications()->count());

        $this->travel(5)->days();
        $this->assertSame(1, $service()['overdue']);
        $this->assertSame(0, $service()['overdue'], 'overdue notice is not repeated the same week');
        $this->assertSame(2, $bursar->notifications()->count());
        $this->assertTrue($this->in(fn () => FeePaymentAgreement::firstOrFail()->is_overdue));

        $this->artisan('fees:follow-up-agreements')->assertSuccessful();
    }

    public function test_withdrawing_an_applicant_awaiting_fees_cancels_the_unpaid_invoice(): void
    {
        $a = $this->enrol($this->acceptedApplication());

        $this->post("/admissions/{$a->id}/transition", ['status' => 'withdrawn', 'decision_notes' => 'Family relocated'])->assertSessionHasNoErrors();

        $a = $this->in(fn () => $a->fresh(['student', 'admissionInvoice']));
        $this->assertSame('withdrawn', $a->status);
        $this->assertSame('withdrawn', $a->student->status);
        $this->assertSame('cancelled', $a->admissionInvoice->status);
    }

    public function test_installment_shares_must_total_one_hundred_percent(): void
    {
        $rows = [['name' => '1st', 'percent' => 50, 'due_date' => '2026-01-10'], ['name' => '2nd', 'percent' => 40, 'due_date' => '2026-05-10']];
        $this->actingAs($this->admin)->put('/fees/installments', ['academic_year_id' => $this->year->id, 'installments' => $rows])->assertSessionHasErrors('installments');

        $rows[1]['percent'] = 50;
        $this->put('/fees/installments', ['academic_year_id' => $this->year->id, 'installments' => $rows])->assertSessionHasNoErrors();
        $this->assertSame(2, $this->in(fn () => FeeInstallment::count()));

        $this->get('/fees/installments')->assertOk();
        $this->get('/fees/clearance')->assertOk();
        $this->get('/fees/clearance?tab=agreements')->assertOk();
    }

    public function test_pending_students_are_excluded_from_term_billing_until_cleared(): void
    {
        $a = $this->enrol($this->acceptedApplication());

        $this->assertSame(1, $this->in(fn () => Invoice::where('student_id', $a->student_id)->count()));
        $this->assertFalse($this->in(fn () => Student::active()->whereKey($a->student_id)->exists()));
    }
}
