<?php

namespace Tests\Feature;

use App\Models\FeeCategory;
use App\Models\InvoiceLayout;
use App\Models\InvoiceTemplate;
use App\Models\School;
use App\Models\User;
use App\Services\Fees\BillingService;
use App\Support\InvoiceLayouts\InvoiceLayoutLibrary;
use App\Support\InvoiceLayouts\InvoiceLayoutSchema;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class InvoiceLayoutTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool('Alpha School');
    }

    private function template(string $code = 'classic-blue'): InvoiceTemplate
    {
        return InvoiceTemplate::where('code', $code)->firstOrFail();
    }

    private function layoutOf(School $school): ?InvoiceLayout
    {
        return app(Tenancy::class)->runAs($school, fn () => InvoiceLayout::first());
    }

    public function test_library_has_twenty_valid_samples(): void
    {
        $this->assertSame(20, InvoiceTemplate::count());

        foreach (InvoiceLayoutLibrary::all() as $code => $sample) {
            $this->assertSame($sample['layout'], InvoiceLayoutSchema::sanitize($sample['layout']), "{$code} is stable under sanitize");
            $this->assertTrue(collect($sample['layout']['blocks'])->contains('type', 'items'), "{$code} lists the fee items");
        }

        InvoiceLayoutLibrary::sync(); // idempotent
        $this->assertSame(20, InvoiceTemplate::count());
    }

    public function test_claimed_layout_becomes_exclusive_and_hidden_from_other_schools(): void
    {
        $template = $this->template();
        $this->actingAs($this->admin)->post("/admin/settings/invoice-layout/{$template->id}/claim")->assertSessionHasNoErrors()->assertRedirect('/admin/settings/invoice-layout/designer');

        $this->assertSame($this->school->id, $template->fresh()->claimed_by_school_id);
        $this->assertSame($template->layout, $this->layoutOf($this->school)->layout);

        ['school' => $beta, 'admin' => $betaAdmin] = $this->makeSchool('Beta School');
        $this->actingAs($betaAdmin)->get('/admin/settings?tab=invoice-layout')->assertInertia(fn (Assert $p) => $p
            ->has('invoiceLayout.templates', 19)
            ->where('invoiceLayout.taken', 1)
            ->where('invoiceLayout.templates', fn ($list) => collect($list)->doesntContain('code', 'classic-blue')));

        $this->actingAs($betaAdmin)->post("/admin/settings/invoice-layout/{$template->id}/claim")->assertSessionHasErrors('template');
        $this->assertNull($this->layoutOf($beta));
    }

    public function test_switching_layouts_returns_the_old_one_to_the_library(): void
    {
        $first = $this->template('classic-blue');
        $second = $this->template('elegant-serif');

        $this->actingAs($this->admin)->post("/admin/settings/invoice-layout/{$first->id}/claim");
        $this->post("/admin/settings/invoice-layout/{$second->id}/claim");

        $this->assertNull($first->fresh()->claimed_by_school_id);
        $this->assertSame($this->school->id, $second->fresh()->claimed_by_school_id);
        $this->assertSame($second->id, $this->layoutOf($this->school)->invoice_template_id);

        $this->post('/admin/settings/invoice-layout/release')->assertRedirect('/admin/settings?tab=invoice-layout');
        $this->assertNull($second->fresh()->claimed_by_school_id);
        $this->assertNull($this->layoutOf($this->school));
    }

    public function test_only_the_school_admin_chooses_and_customises(): void
    {
        $template = $this->template();
        $bursar = $this->makeUserWithRole($this->school, 'bursar');
        $this->actingAs($bursar)->post("/admin/settings/invoice-layout/{$template->id}/claim")->assertForbidden();

        $this->actingAs($this->admin)->post("/admin/settings/invoice-layout/{$template->id}/claim");

        $layout = $template->layout;
        $layout['page']['font'] = 'Merriweather';
        $this->actingAs($bursar)->put('/admin/settings/invoice-layout', ['layout' => $layout])->assertForbidden();
        $this->actingAs($this->admin)->put('/admin/settings/invoice-layout', ['layout' => $layout])->assertSessionHasNoErrors();
        $this->assertSame('Merriweather', $this->layoutOf($this->school)->layout['page']['font']);
    }

    public function test_saved_layouts_are_sanitised(): void
    {
        $template = $this->template();
        $this->actingAs($this->admin)->post("/admin/settings/invoice-layout/{$template->id}/claim");

        $layout = $template->layout;
        $layout['page']['font'] = 'Comic Hacker';
        $layout['page']['accent'] = 'red; background:url(x)';
        $layout['blocks'][] = ['type' => 'script', 'id' => 'x'];
        $layout['blocks'][] = ['type' => 'text', 'id' => 'rules', 'label' => 'School rules<script>', 'fontSize' => 400, 'width' => 7, 'options' => ['text' => "Line one\n<b>Line two</b>"]];
        $this->put('/admin/settings/invoice-layout', ['layout' => $layout])->assertSessionHasNoErrors();

        $saved = $this->layoutOf($this->school)->layout;
        $this->assertSame('Inter', $saved['page']['font']);
        $this->assertSame('#4361ee', $saved['page']['accent']);
        $custom = collect($saved['blocks'])->firstWhere('id', 'rules');
        $this->assertSame('School rules', $custom['label']);
        $this->assertSame(40, $custom['fontSize']);
        $this->assertSame(12, $custom['width']);
        $this->assertSame("Line one\nLine two", $custom['options']['text']);
        $this->assertFalse(collect($saved['blocks'])->contains('type', 'script'));

        // The fee table cannot be removed.
        $layout['blocks'] = array_values(array_filter($layout['blocks'], fn ($b) => ($b['type'] ?? '') !== 'items'));
        $this->put('/admin/settings/invoice-layout', ['layout' => $layout])->assertSessionHasErrors('layout');
    }

    public function test_invoices_print_with_the_school_layout_once_chosen(): void
    {
        $student = $this->makeStudent($this->school);
        $this->actingAs($this->admin);
        $invoice = app(Tenancy::class)->runAs($this->school, function () use ($student) {
            $cat = FeeCategory::create(['name' => 'Tuition']);

            return app(BillingService::class)->issue($student, [['fee_category_id' => $cat->id, 'description' => 'Tuition', 'amount' => 250000]], ['issue_date' => today()->toDateString()]);
        });

        $this->get("/fees/invoices/{$invoice->id}")->assertInertia(fn (Assert $p) => $p->where('layout', null)->where('document', null));

        $this->post('/admin/settings/invoice-layout/'.$this->template('ankara-bilingual')->id.'/claim');
        $this->get("/fees/invoices/{$invoice->id}")->assertInertia(fn (Assert $p) => $p
            ->where('layout.page.font', 'Nunito')
            ->where('document.invoice.invoice_no', $invoice->invoice_no)
            ->where('document.invoice.balance_words', 'Two hundred and fifty thousand shillings only')
            ->where('document.student.admission_no', $student->admission_no));

        $this->get('/fees/invoice-layouts')->assertRedirect('/admin/settings?tab=invoice-layout');
        $this->get('/admin/settings')->assertInertia(fn (Assert $p) => $p->missing('invoiceLayout'));
        $this->get('/admin/settings?tab=invoice-layout')->assertInertia(fn (Assert $p) => $p->where('invoiceLayout.current.template', 'Ankara (Kiswahili / English)'));
        $this->get('/admin/settings/invoice-layout/designer')->assertOk()->assertInertia(fn (Assert $p) => $p->has('fonts', 20));
    }

    public function test_platform_admin_sees_owners_and_can_release(): void
    {
        $template = $this->template();
        $this->actingAs($this->admin)->post("/admin/settings/invoice-layout/{$template->id}/claim");

        $root = new User(['name' => 'Platform Admin', 'email' => 'root@platform.test', 'password' => 'password']);
        $root->is_super_admin = true;
        $root->save();

        $this->actingAs($root)->get('/saas/invoice-layouts')->assertOk()->assertInertia(fn (Assert $p) => $p
            ->has('templates', 20)
            ->where('templates.0.school.name', 'Alpha School'));

        $this->post("/saas/invoice-layouts/{$template->id}/release")->assertRedirect();
        $this->assertNull($template->fresh()->claimed_by_school_id);
        $this->assertNull($this->layoutOf($this->school));
    }
}
