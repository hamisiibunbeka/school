<?php

namespace App\Services\Students;

use App\Models\Sponsor;
use App\Models\Student;
use App\Models\StudentSponsorship;
use App\Services\AuditLogger;
use App\Support\Tenancy;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Creating, changing and ending a student's sponsorship. Used by the
 * admission / edit form and by the Sponsorship tab on the student profile.
 */
class SponsorshipService
{
    public const MAX_KB = 5120;

    public const MIMES = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];

    /**
     * Validation rules for a sponsorship payload: either an existing
     * sponsor_id or the details of a new sponsor under "sponsor".
     *
     * @return array<string, mixed>
     */
    public static function rules(string $prefix = '', bool $optional = false): array
    {
        $p = $prefix === '' ? '' : "{$prefix}.";
        $active = $optional ? "required_if_accepted:{$p}enabled" : 'required';
        $schoolId = app(Tenancy::class)->schoolId();

        return [
            "{$p}sponsor_id" => ['nullable', Rule::exists('sponsors', 'id')->where('school_id', $schoolId)],
            "{$p}sponsor.name" => ['nullable', 'string', 'max:150'],
            "{$p}sponsor.type" => ['nullable', Rule::in(Sponsor::TYPES)],
            "{$p}sponsor.contact_person" => ['nullable', 'string', 'max:120'],
            "{$p}sponsor.phone" => ['nullable', 'string', 'max:20'],
            "{$p}sponsor.email" => ['nullable', 'email', 'max:150'],
            "{$p}sponsor.address" => ['nullable', 'string', 'max:255'],
            "{$p}coverage" => ['nullable', $active, Rule::in(['full', 'partial'])],
            "{$p}percentage" => ['nullable', "required_if:{$p}coverage,partial", 'numeric', 'min:1', 'max:99.99'],
            "{$p}covers" => ['nullable', 'string', 'max:150'],
            "{$p}reference" => ['nullable', 'string', 'max:60'],
            "{$p}start_date" => ['nullable', 'date'],
            "{$p}end_date" => ['nullable', 'date', "after_or_equal:{$p}start_date"],
            "{$p}notes" => ['nullable', 'string', 'max:255'],
            "{$p}attachment" => ['nullable', 'file', 'max:'.self::MAX_KB, 'mimes:'.implode(',', self::MIMES)],
            "{$p}remove_attachment" => ['nullable', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public static function messages(string $prefix = ''): array
    {
        $p = $prefix === '' ? '' : "{$prefix}.";

        return [
            "{$p}percentage.required_if" => 'Enter the percentage the sponsor covers.',
            "{$p}coverage.required_if_accepted" => 'Choose full or partial coverage.',
            "{$p}attachment.max" => 'The attachment may not be larger than 5 MB.',
            "{$p}attachment.mimes" => 'Attach a PDF, image (JPG/PNG) or Word document.',
        ];
    }

    /**
     * Payload must name a sponsor: an existing one or a new sponsor's name.
     *
     * @param  array<string, mixed>  $data
     */
    public static function missingSponsor(array $data): bool
    {
        return empty($data['sponsor_id']) && trim((string) ($data['sponsor']['name'] ?? '')) === '';
    }

    /** @param  array<string, mixed>  $data */
    public function create(Student $student, array $data): StudentSponsorship
    {
        $sponsor = $this->resolveSponsor($data);

        $sponsorship = $student->sponsorships()->create([
            ...$this->terms($data),
            'sponsor_id' => $sponsor->id,
            'status' => 'active',
        ]);
        $this->applyAttachment($sponsorship, $data);
        AuditLogger::log('sponsored', $student, "Sponsorship by {$sponsor->name} added for {$student->full_name}", module: 'students');

        return $sponsorship;
    }

    /**
     * Form sync: keep the current sponsorship (same sponsor → update its terms),
     * switch sponsor (end the old one, start a new one), or end it when unticked.
     *
     * @param  array<string, mixed>  $data
     */
    public function sync(Student $student, array $data): void
    {
        $current = $student->sponsorships()->where('status', 'active')->latest('id')->first();

        if (empty($data['enabled'])) {
            if ($current) {
                $this->end($current);
            }

            return;
        }

        if ($current && ! empty($data['sponsor_id']) && (int) $data['sponsor_id'] === $current->sponsor_id) {
            $current->update($this->terms($data));
            $this->applyAttachment($current, $data);

            return;
        }

        if ($current) {
            $this->end($current);
        }
        $this->create($student, $data);
    }

    /**
     * Store a newly uploaded attachment (replacing any previous file) or
     * remove the current one when asked.
     *
     * @param  array<string, mixed>  $data
     */
    public function applyAttachment(StudentSponsorship $sponsorship, array $data): void
    {
        $file = $data['attachment'] ?? null;

        if ($file instanceof UploadedFile) {
            $this->deleteAttachment($sponsorship);
            $sponsorship->update([
                'attachment_path' => $file->store("students/{$sponsorship->student_id}/sponsorships"),
                'attachment_name' => mb_substr($file->getClientOriginalName(), 0, 255),
                'attachment_mime' => $file->getClientMimeType(),
                'attachment_size' => $file->getSize(),
            ]);

            return;
        }

        if (! empty($data['remove_attachment']) && filter_var($data['remove_attachment'], FILTER_VALIDATE_BOOLEAN)) {
            $this->deleteAttachment($sponsorship);
        }
    }

    public function deleteAttachment(StudentSponsorship $sponsorship): void
    {
        if ($sponsorship->attachment_path) {
            Storage::delete($sponsorship->attachment_path);
            $sponsorship->update(['attachment_path' => null, 'attachment_name' => null, 'attachment_mime' => null, 'attachment_size' => null]);
        }
    }

    public function end(StudentSponsorship $sponsorship, ?string $date = null): void
    {
        $sponsorship->update(['status' => 'ended', 'end_date' => $date ?? $sponsorship->end_date?->toDateString() ?? now()->toDateString()]);
        AuditLogger::log('sponsorship_ended', $sponsorship->student, "Sponsorship by {$sponsorship->sponsor?->name} ended for {$sponsorship->student?->full_name}", module: 'students');
    }

    /** @param  array<string, mixed>  $data */
    public function resolveSponsor(array $data): Sponsor
    {
        if (! empty($data['sponsor_id'])) {
            $sponsor = Sponsor::findOrFail($data['sponsor_id']);
            // Allow correcting the sponsor's contact details from the same form.
            $details = array_filter((array) ($data['sponsor'] ?? []), fn ($v) => $v !== null && $v !== '');
            if ($details) {
                $sponsor->update($details);
            }

            return $sponsor;
        }

        $details = (array) $data['sponsor'];
        $name = trim((string) $details['name']);

        // Re-use a sponsor with the same name instead of creating duplicates.
        return Sponsor::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->first()
            ?? Sponsor::create([
                'name' => $name,
                'type' => $details['type'] ?? 'organization',
                'contact_person' => $details['contact_person'] ?? null,
                'phone' => $details['phone'] ?? null,
                'email' => $details['email'] ?? null,
                'address' => $details['address'] ?? null,
            ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function terms(array $data): array
    {
        $partial = ($data['coverage'] ?? 'full') === 'partial';

        return [
            'coverage' => $partial ? 'partial' : 'full',
            'percentage' => $partial ? $data['percentage'] : null,
            'covers' => $data['covers'] ?? null,
            'reference' => $data['reference'] ?? null,
            'start_date' => $data['start_date'] ?? now()->toDateString(),
            'end_date' => $data['end_date'] ?? null,
            'notes' => $data['notes'] ?? null,
        ];
    }

    /** Sponsors for pickers. @return array<int, array<string, mixed>> */
    public static function options(): array
    {
        return Sponsor::withCount(['sponsorships as active_count' => fn ($q) => $q->where('status', 'active')])
            ->orderBy('name')->get()
            ->map(fn (Sponsor $s) => [
                'value' => $s->id,
                'label' => $s->name,
                'type' => $s->type,
                'contact_person' => $s->contact_person,
                'phone' => $s->phone,
                'email' => $s->email,
                'address' => $s->address,
                'active_count' => $s->active_count,
            ])->all();
    }
}
