<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\FiscalYear;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Shared helpers for the accounting controllers. */
abstract class AccountingController extends Controller
{
    /**
     * Separation of duties (SRS 4.10 / 13): the maker of a record may not approve it.
     * Super administrators are exempt.
     */
    protected function assertDifferentUser(Request $request, ?int $makerId, string $what = 'journal'): void
    {
        $user = $request->user();

        if ($makerId && $makerId === $user->id && ! $user->is_super_admin) {
            throw ValidationException::withMessages([
                'approval' => "Maker-checker control: you created this {$what}, so it must be approved by a different user.",
            ]);
        }
    }

    protected function canApprove(Request $request, ?int $makerId): bool
    {
        $user = $request->user();

        return $user->can('accounting.manage') && (! $makerId || $makerId !== $user->id || $user->is_super_admin);
    }

    protected function assertOpenPeriod(string $date): void
    {
        $year = FiscalYear::forDate($date);
        if ($year && $year->isClosed()) {
            throw ValidationException::withMessages(['date' => "The fiscal period {$year->name} is closed for posting."]);
        }
    }

    /** Validate a Y-m-d request parameter, falling back to a default. */
    protected function dateParam(Request $request, string $key, string $default): string
    {
        $value = (string) $request->query($key, '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            try {
                return CarbonImmutable::parse($value)->toDateString();
            } catch (\Throwable) {
                // fall through
            }
        }

        return $default;
    }

    /** Start of the fiscal year containing today (or 1 January). */
    protected function fiscalYearStart(?string $date = null): string
    {
        $date ??= now()->toDateString();

        return FiscalYear::forDate($date)?->start_date?->toDateString() ?? CarbonImmutable::parse($date)->startOfYear()->toDateString();
    }

    /** @return array<string, mixed> overview header for printed reports (SRS 4.23) */
    protected function reportMeta(): array
    {
        return [
            'generated_at' => now()->toIso8601String(),
            'generated_by' => auth()->user()?->name,
            'currency' => $this->tenancy()->school()?->currency ?? 'TZS',
        ];
    }

    /** @return array<int, array<string, mixed>> */
    protected function auditTrail(Model $model): array
    {
        return AuditLog::with('user:id,name')
            ->where('auditable_type', $model->getMorphClass())
            ->where('auditable_id', $model->getKey())
            ->latest('id')
            ->limit(50)
            ->get()
            ->map(fn (AuditLog $l) => [
                'id' => $l->id,
                'action' => $l->action,
                'description' => $l->description,
                'user' => $l->user?->name,
                'reason' => $l->new_values['reason'] ?? null,
                'created_at' => $l->created_at?->toIso8601String(),
            ])->all();
    }

    /** Most recent reason recorded for an audit action (e.g. rejected). */
    protected function lastReason(Model $model, string $action): ?string
    {
        $log = AuditLog::where('auditable_type', $model->getMorphClass())
            ->where('auditable_id', $model->getKey())
            ->where('action', $action)
            ->latest('id')
            ->first();

        return $log?->new_values['reason'] ?? null;
    }
}
