<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\InvoiceLayout;
use App\Models\InvoiceTemplate;
use App\Services\AuditLogger;
use App\Services\Fees\InvoiceDocument;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Platform view of the invoice layout library: which school owns which sample, and releasing one. */
class InvoiceLayoutController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('saas/invoice-layouts', [
            'templates' => InvoiceTemplate::with('claimer:id,name,tenant_id', 'claimer.tenant:id,name')->orderBy('sort_order')->get()
                ->map(fn (InvoiceTemplate $t) => [
                    'id' => $t->id,
                    'code' => $t->code,
                    'name' => $t->name,
                    'description' => $t->description,
                    'layout' => $t->layout,
                    'is_active' => $t->is_active,
                    'school' => $t->claimer ? ['id' => $t->claimer->id, 'name' => $t->claimer->name, 'tenant' => $t->claimer->tenant?->name] : null,
                    'claimed_at' => $t->claimed_at?->toDateTimeString(),
                ]),
            'sample' => InvoiceDocument::sample(null),
        ]);
    }

    /** Free a layout (e.g. the school left the platform): it returns to every school's gallery. */
    public function release(InvoiceTemplate $template): RedirectResponse
    {
        $schoolId = $template->claimed_by_school_id;
        if (! $schoolId) {
            return back();
        }

        DB::transaction(function () use ($template, $schoolId) {
            $template->forceFill(['claimed_by_school_id' => null, 'claimed_at' => null])->save();
            // The school's customised copy goes too, so the design is no longer in two schools' hands.
            InvoiceLayout::withoutGlobalScopes()->where('school_id', $schoolId)->where('invoice_template_id', $template->id)->delete();
        });

        AuditLogger::log('released', $template, "Platform released invoice layout “{$template->name}” from school #{$schoolId}", module: 'saas');
        $this->toast("“{$template->name}” is available to all schools again.");

        return back();
    }
}
