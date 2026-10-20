<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DocumentSequence;
use App\Services\DocumentNumber;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** School profile, document numbering and general settings (SRS 4.2). */
class SettingsController extends Controller
{
    public const LEVELS = ['nursery', 'primary', 'secondary', 'combined'];

    public const RESIDENCE = ['day', 'boarding', 'mixed'];

    public const REGIONS = ['Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pemba North', 'Pemba South', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Unguja North', 'Unguja South', 'Mjini Magharibi'];

    public const DEFAULT_SETTINGS = [
        'pass_mark' => 30,
        'attendance_alert_threshold' => 80,
        'fee_reminder_days' => 7,
        'late_after' => '07:45',
        'sms_sender_id' => '',
        'payment_instructions' => '',
        'bank_name' => '',
        'bank_account_name' => '',
        'bank_account_no' => '',
        'mobile_money_provider' => '',
        'mobile_money_paybill' => '',
        'mobile_money_account' => '',
        // Teacher workload (periods per week); teachers can have their own limit on their HR record.
        'max_teaching_periods' => 30,
        'workload_enforcement' => 'warn', // warn | block
        'class_teacher_periods' => 0,
    ];

    public function edit(Request $request): Response
    {
        $school = $this->tenancy()->school();

        $sequences = DocumentSequence::where('school_id', $school->id)->get()->keyBy('type');
        $numbering = collect(DocumentNumber::DEFAULTS)->map(function ($prefix, $type) use ($sequences) {
            $seq = $sequences[$type] ?? null;
            $p = $seq->prefix ?? $prefix;
            $pad = $seq->padding ?? 5;
            $next = $seq->next_number ?? 1;

            return [
                'type' => $type,
                'prefix' => $p,
                'padding' => $pad,
                'next_number' => $next,
                'preview' => $p.str_pad((string) $next, $pad, '0', STR_PAD_LEFT),
                'exists' => (bool) $seq,
            ];
        })->merge(
            $sequences->except(array_keys(DocumentNumber::DEFAULTS))->map(fn ($seq) => [
                'type' => $seq->type, 'prefix' => $seq->prefix, 'padding' => $seq->padding, 'next_number' => $seq->next_number,
                'preview' => $seq->prefix.str_pad((string) $seq->next_number, $seq->padding, '0', STR_PAD_LEFT), 'exists' => true,
            ])
        )->values();

        return Inertia::render('admin/settings', [
            'school' => [
                ...$school->only(['id', 'name', 'code', 'registration_no', 'level', 'residence_type', 'motto', 'email', 'phone', 'address', 'region', 'currency', 'timezone', 'logo_url']),
            ],
            'settings' => array_merge(self::DEFAULT_SETTINGS, $school->settings ?? []),
            'numbering' => $numbering,
            'options' => [
                'levels' => self::LEVELS,
                'residence' => self::RESIDENCE,
                'regions' => self::REGIONS,
                'currencies' => ['TZS', 'KES', 'UGX', 'RWF', 'USD'],
                'timezones' => ['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'Africa/Kigali', 'UTC'],
            ],
            // Invoice layout tab: built only when that tab is open (otherwise fetched by a partial reload on first visit).
            'invoiceLayout' => $request->query('tab') === 'invoice-layout'
                ? fn () => InvoiceLayoutController::settingsTab($request->user())
                : Inertia::optional(fn () => InvoiceLayoutController::settingsTab($request->user())),
            'initialTab' => (string) $request->query('tab', 'profile'),
        ]);
    }

    public function updateProfile(Request $request): RedirectResponse
    {
        $school = $this->tenancy()->school();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'code' => ['nullable', 'string', 'max:20'],
            'registration_no' => ['nullable', 'string', 'max:50'],
            'level' => ['required', Rule::in(self::LEVELS)],
            'residence_type' => ['required', Rule::in(self::RESIDENCE)],
            'motto' => ['nullable', 'string', 'max:200'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:255'],
            'region' => ['nullable', 'string', 'max:60'],
            'currency' => ['required', 'string', 'size:3'],
            'timezone' => ['required', 'timezone'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'remove_logo' => ['boolean'],
        ]);

        $old = $school->only(array_keys(collect($data)->except(['logo', 'remove_logo'])->all()));

        $school->fill(collect($data)->except(['logo', 'remove_logo'])->all());

        if ($request->hasFile('logo')) {
            if ($school->logo_path) {
                Storage::disk('public')->delete($school->logo_path);
            }
            $school->logo_path = $request->file('logo')->store("schools/{$school->id}", 'public');
        } elseif ($request->boolean('remove_logo') && $school->logo_path) {
            Storage::disk('public')->delete($school->logo_path);
            $school->logo_path = null;
        }

        $school->save();

        $this->audit('settings_changed', $school, 'Updated school profile', 'administration', $old, $school->only(array_keys($old)));
        $this->toast('School profile saved.');

        return back();
    }

    public function updateSettings(Request $request): RedirectResponse
    {
        $school = $this->tenancy()->school();

        $data = $request->validate([
            'pass_mark' => ['required', 'numeric', 'min:0', 'max:100'],
            'attendance_alert_threshold' => ['required', 'numeric', 'min:0', 'max:100'],
            'fee_reminder_days' => ['required', 'integer', 'min:0', 'max:90'],
            'late_after' => ['nullable', 'date_format:H:i'],
            'sms_sender_id' => ['nullable', 'string', 'max:11', 'regex:/^[A-Za-z0-9 ]*$/'],
            'payment_instructions' => ['nullable', 'string', 'max:2000'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'bank_account_name' => ['nullable', 'string', 'max:150'],
            'bank_account_no' => ['nullable', 'string', 'max:50'],
            'mobile_money_provider' => ['nullable', 'string', 'max:50'],
            'mobile_money_paybill' => ['nullable', 'string', 'max:30'],
            'mobile_money_account' => ['nullable', 'string', 'max:100'],
            'max_teaching_periods' => ['required', 'integer', 'min:1', 'max:80'],
            'workload_enforcement' => ['required', Rule::in(['warn', 'block'])],
            'class_teacher_periods' => ['required', 'integer', 'min:0', 'max:20'],
        ], [], ['max_teaching_periods' => 'weekly period limit', 'class_teacher_periods' => 'class-teacher periods']);

        $old = $school->settings ?? [];
        $school->settings = array_merge($old, $data);
        $school->save();

        $changed = collect($data)->filter(fn ($v, $k) => ($old[$k] ?? null) != $v);
        $this->audit('settings_changed', $school, 'Updated general settings', 'administration', collect($old)->only($changed->keys())->all(), $changed->all());
        $this->toast('Settings saved.');

        return back();
    }

    public function updateSequence(Request $request, string $type): RedirectResponse
    {
        abort_unless(preg_match('/^[a-z_]{2,40}$/', $type) === 1, 404);
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'prefix' => ['required', 'string', 'max:20', 'regex:/^[A-Za-z0-9\-\/_.]*$/'],
            'padding' => ['required', 'integer', 'min:1', 'max:10'],
        ]);

        $sequence = DocumentSequence::firstOrNew(['school_id' => $schoolId, 'type' => $type]);
        $old = $sequence->exists ? $sequence->only(['prefix', 'padding']) : null;
        $sequence->next_number ??= 1;
        $sequence->fill($data)->save();

        $this->audit('settings_changed', null, "Changed {$type} numbering to {$data['prefix']} (padding {$data['padding']})", 'administration', $old, $data);
        $this->toast(ucfirst(str_replace('_', ' ', $type)).' numbering updated.');

        return back();
    }
}
