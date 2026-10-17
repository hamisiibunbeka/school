<?php

namespace App\Http\Controllers\Students;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\StudentSponsorship;
use App\Services\Students\SponsorshipService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Validator;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Sponsorship tab on the student profile: add, edit, end and remove sponsorships. */
class SponsorshipController extends Controller
{
    public function __construct(private SponsorshipService $sponsorships) {}

    public function store(Request $request, Student $student): RedirectResponse
    {
        $data = $this->validated($request);

        DB::transaction(function () use ($student, $data) {
            // A student has one current sponsorship per sponsor; adding the same sponsor again just updates it.
            $existing = ! empty($data['sponsor_id'])
                ? $student->sponsorships()->where('status', 'active')->where('sponsor_id', $data['sponsor_id'])->first()
                : null;
            $existing ? $this->updateTerms($existing, $data) : $this->sponsorships->create($student, $data);
        });

        $this->toast('Sponsorship saved.');

        return back();
    }

    public function update(Request $request, StudentSponsorship $sponsorship): RedirectResponse
    {
        $data = $this->validated($request);
        $data['sponsor_id'] = $sponsorship->sponsor_id; // the sponsor itself is fixed; its details can be corrected

        DB::transaction(fn () => $this->updateTerms($sponsorship, $data));
        $this->audit('updated', $sponsorship->student, "Sponsorship by {$sponsorship->sponsor?->name} updated", 'students');
        $this->toast('Sponsorship updated.');

        return back();
    }

    public function end(Request $request, StudentSponsorship $sponsorship): RedirectResponse
    {
        $data = $request->validate(['end_date' => ['required', 'date', 'after_or_equal:'.($sponsorship->start_date?->toDateString() ?? '1900-01-01')]]);
        if ($sponsorship->status !== 'active') {
            $this->toast('This sponsorship has already ended.', 'error');

            return back();
        }

        $this->sponsorships->end($sponsorship, $data['end_date']);
        $this->toast('Sponsorship ended.');

        return back();
    }

    public function destroy(StudentSponsorship $sponsorship): RedirectResponse
    {
        $this->audit('deleted', $sponsorship->student, "Sponsorship by {$sponsorship->sponsor?->name} removed from {$sponsorship->student?->full_name}", 'students');
        $this->sponsorships->deleteAttachment($sponsorship);
        $sponsorship->delete();
        $this->toast('Sponsorship removed.');

        return back();
    }

    /** Open the sponsorship's attachment (inline for PDFs/images, download otherwise). */
    public function attachment(StudentSponsorship $sponsorship): StreamedResponse
    {
        abort_unless($sponsorship->attachment_path && Storage::exists($sponsorship->attachment_path), 404);

        $inline = str_starts_with((string) $sponsorship->attachment_mime, 'image/') || $sponsorship->attachment_mime === 'application/pdf';

        return Storage::response($sponsorship->attachment_path, $sponsorship->attachment_name, [], $inline ? 'inline' : 'attachment');
    }

    /** @param  array<string, mixed>  $data */
    private function updateTerms(StudentSponsorship $sponsorship, array $data): void
    {
        $this->sponsorships->resolveSponsor($data); // saves corrected sponsor details
        $partial = ($data['coverage'] ?? 'full') === 'partial';
        $sponsorship->update([
            'coverage' => $partial ? 'partial' : 'full',
            'percentage' => $partial ? $data['percentage'] : null,
            'covers' => $data['covers'] ?? null,
            'reference' => $data['reference'] ?? null,
            'start_date' => $data['start_date'] ?? $sponsorship->start_date,
            'end_date' => $data['end_date'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
        $this->sponsorships->applyAttachment($sponsorship, $data);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $validator = validator($request->all(), SponsorshipService::rules(), SponsorshipService::messages(), ['sponsor.name' => 'sponsor name', 'percentage' => 'percentage covered']);
        $validator->after(function (Validator $v) use ($request) {
            if (! $request->route('sponsorship') && SponsorshipService::missingSponsor($request->all())) {
                $v->errors()->add('sponsor.name', "Choose an existing sponsor or enter the new sponsor's name.");
            }
        });

        return $validator->validate();
    }
}
