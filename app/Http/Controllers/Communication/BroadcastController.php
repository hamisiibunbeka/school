<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\AdmissionApplication;
use App\Models\Broadcast;
use App\Models\ContactGroup;
use App\Models\MessageLog;
use App\Models\MessageTemplate;
use App\Services\Messaging\BroadcastService;
use App\Services\Messaging\MessageService;
use App\Services\Messaging\SmsCredits;
use App\Support\Lookups;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Inertia\Inertia;
use Inertia\Response;

/** Broadcast centre: bulk SMS / email to any mix of stakeholder groups (SRS 4.18). */
class BroadcastController extends Controller
{
    public const AUDIENCES = ['guardians', 'defaulters', 'students', 'staff', 'applicants', 'suppliers', 'group', 'custom'];

    public function __construct(private BroadcastService $broadcasts, private SmsCredits $credits) {}

    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'channel' => ''], $request->only(['search', 'status', 'channel']));

        $broadcasts = Broadcast::query()
            ->with('creator:id,name')
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('title', 'like', "%{$v}%")->orWhere('body', 'like', "%{$v}%")))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['channel'], fn ($q, $v) => $q->where('channel', $v))
            ->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Broadcast $b) => $this->row($b));

        $month = Broadcast::where('created_at', '>=', now()->startOfMonth())->whereIn('status', ['completed', 'sending']);

        return Inertia::render('communication/broadcasts/index', [
            'broadcasts' => $broadcasts,
            'filters' => $filters,
            'balance' => $this->credits->balance($this->tenancy()->tenant()),
            'stats' => [
                'month_broadcasts' => (clone $month)->count(),
                'month_messages' => (int) (clone $month)->sum('sent'),
                'month_credits' => (int) (clone $month)->sum('credits'),
                'scheduled' => Broadcast::where('status', 'scheduled')->count(),
                'drafts' => Broadcast::where('status', 'draft')->count(),
            ],
        ]);
    }

    public function create(Request $request): Response
    {
        $source = $request->integer('from') ? Broadcast::find($request->integer('from')) : null;

        return $this->composer($source ? [
            'title' => $source->title.' (copy)',
            'channel' => $source->channel,
            'subject' => $source->subject,
            'body' => $source->body,
            'audiences' => $source->audiences,
        ] : null);
    }

    public function edit(Broadcast $broadcast): Response|RedirectResponse
    {
        if (! $broadcast->isEditable()) {
            $this->toast('Only drafts and scheduled broadcasts can be edited.', 'error');

            return to_route('communication.broadcasts.show', $broadcast);
        }

        return $this->composer([
            'id' => $broadcast->id,
            'title' => $broadcast->title,
            'channel' => $broadcast->channel,
            'subject' => $broadcast->subject,
            'body' => $broadcast->body,
            'audiences' => $broadcast->audiences,
            'scheduled_at' => $broadcast->scheduled_at?->format('Y-m-d\TH:i'),
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $data = $this->validated($request, 'preview');

        return response()->json($this->broadcasts->preview($data['channel'], $data['audiences'], $data['body'], $data['subject'] ?? null));
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        return $this->save(new Broadcast(['created_by' => auth()->id()]), $data);
    }

    public function update(Request $request, Broadcast $broadcast): RedirectResponse
    {
        abort_unless($broadcast->isEditable(), 422, 'This broadcast can no longer be edited.');

        return $this->save($broadcast, $this->validated($request));
    }

    public function show(Request $request, Broadcast $broadcast): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'channel' => ''], $request->only(['search', 'status', 'channel']));

        $logs = $broadcast->logs()
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('recipient', 'like', "%{$v}%")->orWhere('recipient_name', 'like', "%{$v}%")))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['channel'], fn ($q, $v) => $q->where('channel', $v))
            ->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (MessageLog $m) => [
                'id' => $m->id,
                'channel' => $m->channel,
                'recipient' => $m->recipient,
                'recipient_name' => $m->recipient_name,
                'subject' => $m->subject,
                'message' => $m->message,
                'status' => $m->status,
                'error' => $m->error,
                'credits' => $m->credits,
                'created_at' => $m->created_at?->toIso8601String(),
            ]);

        $byStatus = $broadcast->logs()->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('communication/broadcasts/show', [
            'broadcast' => $this->row($broadcast->load('creator:id,name')) + ['body' => $broadcast->body, 'subject' => $broadcast->subject, 'error' => $broadcast->error],
            'logs' => $logs,
            'filters' => $filters,
            'by_status' => $byStatus,
        ]);
    }

    public function cancel(Broadcast $broadcast): RedirectResponse
    {
        if ($broadcast->status !== 'scheduled') {
            $this->toast('Only scheduled broadcasts can be cancelled.', 'error');

            return back();
        }

        $broadcast->update(['status' => 'cancelled']);
        $this->audit('cancelled', $broadcast, "Scheduled broadcast \"{$broadcast->title}\" cancelled", 'communication');
        $this->toast('Scheduled broadcast cancelled.');

        return back();
    }

    public function retry(Broadcast $broadcast): RedirectResponse
    {
        $count = $this->broadcasts->retryFailed($broadcast);
        $broadcast->refresh();
        $this->audit('retried', $broadcast, "Retried {$count} failed message(s) of broadcast \"{$broadcast->title}\"", 'communication');
        $this->toast($count ? "Retried {$count} message(s): {$broadcast->failed} still failed." : 'There are no failed messages to retry.', $broadcast->failed ? 'warning' : 'success');

        return back();
    }

    public function destroy(Broadcast $broadcast): RedirectResponse
    {
        if (! in_array($broadcast->status, ['draft', 'cancelled'], true)) {
            $this->toast('Sent broadcasts are kept as a record and cannot be deleted.', 'error');

            return back();
        }

        $this->audit('deleted', $broadcast, "Broadcast \"{$broadcast->title}\" deleted", 'communication');
        $broadcast->delete();
        $this->toast('Broadcast deleted.');

        return to_route('communication.broadcasts.index');
    }

    /** @param  array<string, mixed>  $data */
    private function save(Broadcast $broadcast, array $data): RedirectResponse
    {
        $action = $data['action'];
        $broadcast->fill([
            'title' => $data['title'],
            'channel' => $data['channel'],
            'subject' => in_array($data['channel'], ['email', 'both'], true) ? ($data['subject'] ?? null) : null,
            'body' => $data['body'],
            'audiences' => $data['audiences'],
            'scheduled_at' => $action === 'schedule' ? Carbon::parse($data['scheduled_at']) : null,
            'status' => $action === 'schedule' ? 'scheduled' : 'draft',
        ]);

        if ($action === 'send') {
            $preview = $this->broadcasts->preview($data['channel'], $data['audiences'], $data['body'], $data['subject'] ?? null);
            if ($preview['sms'] + $preview['email'] === 0) {
                $this->toast('No valid recipients were found for the selected audiences.', 'error');

                return back();
            }
            if (! $preview['enough']) {
                $this->toast("This broadcast needs {$preview['credits']} SMS credits but your balance is {$preview['balance']}. Buy an SMS bundle or reduce the audience.", 'error');

                return back();
            }
        }

        $broadcast->save();

        if ($action === 'send') {
            $this->broadcasts->launch($broadcast);
            $broadcast->refresh();
            $this->toast($broadcast->status === 'completed'
                ? "Broadcast sent: {$broadcast->sent} message(s) delivered to the provider".($broadcast->failed ? ", {$broadcast->failed} failed" : '').'.'
                : "Broadcast queued: {$broadcast->recipients} messages will be sent in the background.", $broadcast->failed ? 'warning' : 'success');
        } elseif ($action === 'schedule') {
            $this->audit('scheduled', $broadcast, "Broadcast \"{$broadcast->title}\" scheduled for {$broadcast->scheduled_at->format('d/m/Y H:i')}", 'communication');
            $this->toast('Broadcast scheduled for '.$broadcast->scheduled_at->format('d/m/Y H:i').'.');
        } else {
            $this->toast('Draft saved.');
        }

        return to_route('communication.broadcasts.show', $broadcast);
    }

    /** @param  array<string, mixed>|null  $draft */
    private function composer(?array $draft): Response
    {
        return Inertia::render('communication/broadcasts/create', [
            'draft' => $draft,
            'balance' => $this->credits->balance($this->tenancy()->tenant()),
            'templates' => MessageTemplate::orderBy('name')->get(['id', 'name', 'channel', 'subject', 'body']),
            'variables' => MessageTemplate::VARIABLES,
            'options' => [
                'classes' => Lookups::classes(),
                'departments' => Lookups::departments(),
                'academic_years' => Lookups::academicYears(),
                'groups' => ContactGroup::withCount('members')->orderBy('name')->get()->map(fn ($g) => ['value' => $g->id, 'label' => "{$g->name} ({$g->members_count})"]),
                'applicant_statuses' => Lookups::enum(AdmissionApplication::STATUSES),
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private function row(Broadcast $b): array
    {
        return [
            'id' => $b->id,
            'title' => $b->title,
            'channel' => $b->channel,
            'status' => $b->status,
            'audiences' => collect($b->audiences)->map(fn ($a) => $this->describe($a))->all(),
            'recipients' => $b->recipients,
            'sent' => $b->sent,
            'failed' => $b->failed,
            'credits' => $b->credits,
            'scheduled_at' => $b->scheduled_at?->toIso8601String(),
            'completed_at' => $b->completed_at?->toIso8601String(),
            'created_at' => $b->created_at?->toIso8601String(),
            'created_by' => $b->creator?->name,
        ];
    }

    /** Human label for an audience spec, e.g. "Parents · Form One · Boarding". */
    private function describe(array $a): string
    {
        static $classes, $groups, $departments;
        $classes ??= collect(Lookups::classes())->pluck('label', 'value');
        $departments ??= collect(Lookups::departments())->pluck('label', 'value');
        $groups ??= ContactGroup::pluck('name', 'id');

        $parts = [match ($a['type']) {
            'guardians' => 'Parents',
            'defaulters' => 'Fee defaulters (> '.number_format((float) ($a['min_balance'] ?? 0)).')',
            'students' => 'Students',
            'staff' => 'Staff',
            'applicants' => 'Admission applicants',
            'suppliers' => 'Suppliers',
            'group' => 'Group: '.($groups[$a['contact_group_id'] ?? 0] ?? 'deleted'),
            'custom' => 'Custom list',
            default => ucfirst($a['type']),
        }];
        if (! empty($a['school_class_id'])) {
            $parts[] = $classes[$a['school_class_id']] ?? 'class';
        }
        if (! empty($a['residence_type'])) {
            $parts[] = ucfirst($a['residence_type']);
        }
        if (! empty($a['category'])) {
            $parts[] = $a['category'] === 'teaching' ? 'Teaching' : 'Non-teaching';
        }
        if (! empty($a['department_id'])) {
            $parts[] = $departments[$a['department_id']] ?? 'department';
        }
        if (! empty($a['status'])) {
            $parts[] = collect((array) $a['status'])->map(fn ($s) => str_replace('_', ' ', $s))->implode(', ');
        }
        if ($a['type'] === 'custom') {
            $parts[] = count(MessageService::splitList((string) ($a['numbers'] ?? ''))).' entries';
        }

        return implode(' · ', $parts);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, string $mode = 'save'): array
    {
        $schoolId = $this->tenancy()->schoolId();

        $validator = validator($request->all(), [
            'action' => [$mode === 'save' ? 'required' : 'nullable', Rule::in(['draft', 'send', 'schedule'])],
            'title' => [$mode === 'save' ? 'required' : 'nullable', 'string', 'max:150'],
            'channel' => ['required', Rule::in(['sms', 'email', 'both'])],
            'subject' => ['nullable', Rule::requiredIf(fn () => in_array($request->input('channel'), ['email', 'both'], true) && $request->input('action') !== 'draft'), 'string', 'max:200'],
            'body' => ['required', 'string', 'max:5000'],
            'scheduled_at' => ['nullable', 'required_if:action,schedule', 'date', 'after:now'],
            'audiences' => ['required', 'array', 'min:1', 'max:10'],
            'audiences.*.type' => ['required', Rule::in(self::AUDIENCES)],
            'audiences.*.school_class_id' => ['nullable', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'audiences.*.residence_type' => ['nullable', Rule::in(['day', 'boarding'])],
            'audiences.*.category' => ['nullable', Rule::in(['teaching', 'non_teaching'])],
            'audiences.*.department_id' => ['nullable', Rule::exists('departments', 'id')->where('school_id', $schoolId)],
            'audiences.*.academic_year_id' => ['nullable', Rule::exists('academic_years', 'id')->where('school_id', $schoolId)],
            'audiences.*.status' => ['nullable', 'array'],
            'audiences.*.status.*' => [Rule::in(AdmissionApplication::STATUSES)],
            'audiences.*.min_balance' => ['nullable', 'numeric', 'min:0'],
            'audiences.*.contact_group_id' => ['nullable', Rule::exists('contact_groups', 'id')->where('school_id', $schoolId)],
            'audiences.*.numbers' => ['nullable', 'string', 'max:20000'],
        ], ['scheduled_at.after' => 'The schedule time must be in the future.'], ['audiences' => 'audience', 'body' => 'message']);

        $validator->after(function (Validator $v) use ($request) {
            foreach ((array) $request->input('audiences', []) as $i => $a) {
                $type = $a['type'] ?? null;
                if ($type === 'group' && empty($a['contact_group_id'])) {
                    $v->errors()->add("audiences.$i.contact_group_id", 'Choose a contact group.');
                }
                if ($type === 'custom' && trim((string) ($a['numbers'] ?? '')) === '') {
                    $v->errors()->add("audiences.$i.numbers", 'Enter at least one phone number or email.');
                }
            }
            if ($request->input('channel') !== 'email' && mb_strlen((string) $request->input('body')) > 1600) {
                $v->errors()->add('body', 'SMS messages are limited to 1,600 characters (10 parts).');
            }
        });

        $data = $validator->validate();
        // Keep only the keys each audience uses so stored specs stay tidy.
        $data['audiences'] = array_map(fn ($a) => array_filter($a, fn ($v) => $v !== null && $v !== '' && $v !== []), $data['audiences']);

        return $data;
    }
}
