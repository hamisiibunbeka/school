<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InvoiceLayout;
use App\Models\InvoiceTemplate;
use App\Models\User;
use App\Services\Fees\InvoiceDocument;
use App\Support\InvoiceLayouts\InvoiceLayoutSchema;
use App\Support\Tenancy;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Invoice layout (School Settings → Invoice layout tab): a gallery of the platform's samples (choosing one makes
 * it exclusive to this school) and a designer for the school's own copy (fonts, sizes, colours, block order, extra blocks).
 */
class InvoiceLayoutController extends Controller
{
    /** Props for the settings tab: the gallery visible to this school and its current layout. */
    public static function settingsTab(?User $user): array
    {
        $tenancy = app(Tenancy::class);
        $schoolId = $tenancy->schoolId();
        $current = InvoiceLayout::with(['template:id,code,name', 'editor:id,name'])->first();

        return [
            'templates' => InvoiceTemplate::visibleTo($schoolId)->orderBy('sort_order')->get()
                ->map(fn (InvoiceTemplate $t) => [
                    'id' => $t->id,
                    'code' => $t->code,
                    'name' => $t->name,
                    'description' => $t->description,
                    'layout' => $t->layout,
                    'mine' => $t->claimed_by_school_id === $schoolId,
                ])->values(),
            'taken' => InvoiceTemplate::where('is_active', true)->whereNotNull('claimed_by_school_id')->where('claimed_by_school_id', '!=', $schoolId)->count(),
            'current' => $current ? [
                'template_id' => $current->invoice_template_id,
                'template' => $current->template?->name,
                'layout' => $current->layout,
                'updated_at' => $current->updated_at?->toDateTimeString(),
                'updated_by' => $current->editor?->name,
            ] : null,
            'sample' => InvoiceDocument::sample($tenancy->school(), $user),
        ];
    }

    /** The school admin chooses (and thereby approves) a sample: it becomes exclusive to this school. */
    public function claim(Request $request, InvoiceTemplate $template): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();

        DB::transaction(function () use ($template, $schoolId, $request) {
            $locked = InvoiceTemplate::whereKey($template->id)->lockForUpdate()->firstOrFail();
            if (! $locked->is_active || ($locked->claimed_by_school_id && $locked->claimed_by_school_id !== $schoolId)) {
                throw ValidationException::withMessages(['template' => "“{$locked->name}” has just been taken by another school. Please choose another layout."]);
            }

            // A school owns one layout at a time: switching hands the previous one back to the library.
            InvoiceTemplate::where('claimed_by_school_id', $schoolId)->whereKeyNot($locked->id)->update(['claimed_by_school_id' => null, 'claimed_at' => null]);
            $locked->forceFill(['claimed_by_school_id' => $schoolId, 'claimed_at' => $locked->claimed_at ?? now()])->save();

            $layout = InvoiceLayout::firstOrNew([]);
            $layout->forceFill(['invoice_template_id' => $locked->id, 'layout' => $locked->layout, 'updated_by' => $request->user()->id])->save();
        });

        $this->audit('claimed', $template, "Chose the “{$template->name}” invoice layout (now exclusive to this school)", 'administration');
        $this->toast("“{$template->name}” is now your school’s invoice layout. Customise it to match your standard.");

        return to_route('admin.invoice-layout.designer');
    }

    /** Give the layout back to the library; invoices print in the standard format again. */
    public function release(): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $name = InvoiceTemplate::where('claimed_by_school_id', $schoolId)->value('name');

        DB::transaction(function () use ($schoolId) {
            InvoiceTemplate::where('claimed_by_school_id', $schoolId)->update(['claimed_by_school_id' => null, 'claimed_at' => null]);
            InvoiceLayout::query()->delete();
        });

        $this->audit('released', null, 'Released the invoice layout'.($name ? " “{$name}”" : '').' back to the library', 'administration');
        $this->toast('Invoice layout released. Invoices now use the standard format.');

        return to_route('admin.settings.edit', ['tab' => 'invoice-layout']);
    }

    public function designer(Request $request): Response|RedirectResponse
    {
        $layout = InvoiceLayout::with('template:id,name,layout')->first();
        if (! $layout) {
            $this->toast('Choose a layout from the gallery first.', 'warning');

            return to_route('admin.settings.edit', ['tab' => 'invoice-layout']);
        }

        return Inertia::render('admin/invoice-layout-designer', [
            'layout' => $layout->layout,
            'template' => $layout->template?->name,
            'sample' => InvoiceDocument::sample($this->tenancy()->school(), $request->user()),
            'fonts' => InvoiceLayoutSchema::FONTS,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate(['layout' => ['required', 'array'], 'layout.blocks' => ['required', 'array', 'max:60'], 'layout.page' => ['required', 'array']]);
        $layout = InvoiceLayout::firstOrFail();

        $clean = InvoiceLayoutSchema::sanitize($data['layout']);
        if (! collect($clean['blocks'])->contains(fn ($b) => $b['type'] === 'items' && $b['visible'])) {
            throw ValidationException::withMessages(['layout' => 'Keep the fee items table visible — an invoice must list what is being charged.']);
        }

        $layout->forceFill(['layout' => $clean, 'updated_by' => $request->user()->id])->save();
        $this->audit('updated', $layout, 'Customised the invoice layout ('.count($clean['blocks']).' blocks, '.$clean['page']['font'].')', 'administration');
        $this->toast('Invoice layout saved.');

        return back();
    }

    /** Throw away customisations and start again from the chosen sample. */
    public function reset(Request $request): RedirectResponse
    {
        $layout = InvoiceLayout::with('template')->firstOrFail();
        abort_unless($layout->template, 404);

        $layout->forceFill(['layout' => $layout->template->layout, 'updated_by' => $request->user()->id])->save();
        $this->audit('reset', $layout, "Reset the invoice layout to the original “{$layout->template->name}” design", 'administration');
        $this->toast('Layout reset to the original design.');

        return back();
    }
}
