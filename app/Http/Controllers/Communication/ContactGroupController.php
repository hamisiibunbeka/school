<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\ContactGroup;
use App\Models\ContactGroupMember;
use App\Services\Messaging\MessageService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Saved contact lists for stakeholders outside the student/staff records (board, PTA, alumni, partners ...). */
class ContactGroupController extends Controller
{
    public function index(Request $request): Response
    {
        $groups = ContactGroup::withCount('members')->orderBy('name')->get();
        $selected = $groups->firstWhere('id', $request->integer('group')) ?? $groups->first();

        return Inertia::render('communication/groups', [
            'groups' => $groups->map(fn ($g) => ['id' => $g->id, 'name' => $g->name, 'description' => $g->description, 'members_count' => $g->members_count]),
            'selected' => $selected?->id,
            'members' => $selected
                ? $selected->members()->orderBy('name')->get(['id', 'name', 'phone', 'email'])
                : [],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $group = ContactGroup::create($this->validated($request));
        $this->audit('created', $group, "Contact group \"{$group->name}\" created", 'communication');
        $this->toast('Contact group created.');

        return to_route('communication.groups.index', ['group' => $group->id]);
    }

    public function update(Request $request, ContactGroup $group): RedirectResponse
    {
        $group->update($this->validated($request));
        $this->toast('Contact group updated.');

        return back();
    }

    public function destroy(ContactGroup $group): RedirectResponse
    {
        $this->audit('deleted', $group, "Contact group \"{$group->name}\" deleted", 'communication');
        $group->delete();
        $this->toast('Contact group deleted.');

        return to_route('communication.groups.index');
    }

    /** Add members from pasted lines: "Name, phone, email" (any order of phone/email; name optional). */
    public function addMembers(Request $request, ContactGroup $group): RedirectResponse
    {
        $data = $request->validate(['lines' => ['required', 'string', 'max:50000']]);

        $existing = $group->members()->get(['phone', 'email']);
        $phones = $existing->pluck('phone')->filter()->flip();
        $emails = $existing->pluck('email')->filter()->map(fn ($e) => strtolower($e))->flip();
        $added = 0;
        $skipped = 0;

        foreach (preg_split('/\r\n|\r|\n/', $data['lines']) as $line) {
            $parts = array_values(array_filter(array_map('trim', preg_split('/[,;\t]/', $line) ?: []), fn ($p) => $p !== ''));
            if (! $parts) {
                continue;
            }

            $phone = null;
            $email = null;
            $name = [];
            foreach ($parts as $p) {
                if (filter_var($p, FILTER_VALIDATE_EMAIL)) {
                    $email = strtolower($p);
                } elseif (! $phone && preg_match('/^\+?[\d\s\-()]{9,}$/', $p) && MessageService::normalizePhone($p)) {
                    $phone = MessageService::normalizePhone($p);
                } else {
                    $name[] = $p;
                }
            }

            if ((! $phone && ! $email) || ($phone && isset($phones[$phone])) || ($email && isset($emails[$email]))) {
                $skipped++;

                continue;
            }

            $group->members()->create(['name' => implode(' ', $name) ?: null, 'phone' => $phone, 'email' => $email]);
            $phone && $phones[$phone] = true;
            $email && $emails[$email] = true;
            $added++;
        }

        $this->toast("{$added} contact(s) added".($skipped ? ", {$skipped} skipped (duplicate or no valid phone/email)" : '').'.', $added ? 'success' : 'warning');

        return back();
    }

    public function updateMember(Request $request, ContactGroupMember $member): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'required_without:email', 'string', 'max:20', fn ($attr, $value, $fail) => MessageService::normalizePhone($value) ? null : $fail('Invalid phone number.')],
            'email' => ['nullable', 'required_without:phone', 'email', 'max:150'],
        ]);
        $data['phone'] = MessageService::normalizePhone($data['phone'] ?? null);

        $member->update($data);
        $this->toast('Contact updated.');

        return back();
    }

    public function destroyMember(ContactGroupMember $member): RedirectResponse
    {
        $member->delete();
        $this->toast('Contact removed.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
