<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\MessageTemplate;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Reusable SMS / email templates with variables (SRS 4.18). */
class TemplateController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'channel' => ''], $request->only(['search', 'channel']));

        $templates = MessageTemplate::query()
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('name', 'like', "%{$v}%")->orWhere('body', 'like', "%{$v}%")))
            ->when($filters['channel'], fn ($q, $v) => $q->where('channel', $v))
            ->orderBy('name')
            ->paginate($this->perPage())
            ->withQueryString();

        return Inertia::render('communication/templates', [
            'templates' => $templates,
            'filters' => $filters,
            'variables' => MessageTemplate::VARIABLES,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $template = MessageTemplate::create($this->validated($request));
        $this->audit('created', $template, "Created message template \"{$template->name}\"", 'communication');
        $this->toast('Template saved.');

        return back();
    }

    public function update(Request $request, MessageTemplate $template): RedirectResponse
    {
        $old = $template->only(['name', 'channel', 'subject', 'body']);
        $template->update($this->validated($request, $template));
        $this->audit('updated', $template, "Updated message template \"{$template->name}\"", 'communication', $old, $template->only(array_keys($old)));
        $this->toast('Template updated.');

        return back();
    }

    public function destroy(MessageTemplate $template): RedirectResponse
    {
        $template->delete();
        $this->audit('deleted', $template, "Deleted message template \"{$template->name}\"", 'communication');
        $this->toast('Template deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?MessageTemplate $template = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('message_templates')->where('school_id', $this->tenancy()->schoolId())->ignore($template?->id)],
            'channel' => ['required', Rule::in(['sms', 'email'])],
            'subject' => ['nullable', 'required_if:channel,email', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:1600'],
        ]);
    }
}
