<?php

namespace App\Providers;

use App\Models\User;
use App\Services\AuditLogger;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(Tenancy::class);
    }

    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureAuthorization();
        $this->configureSchemaMacros();
        $this->configureAuthEvents();
    }

    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }

    /**
     * Permissions are strings such as "students.manage" stored on the user's role.
     * Use them anywhere: $user->can('fees.manage'), @can, or the "can:" middleware.
     */
    protected function configureAuthorization(): void
    {
        Gate::before(function (User $user, string $ability) {
            return $user->hasPermission($ability) ? true : null;
        });
    }

    protected function configureSchemaMacros(): void
    {
        // Adds tenant_id + school_id to a school-owned table.
        Blueprint::macro('schoolScoped', function () {
            /** @var Blueprint $this */
            $this->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $this->foreignId('school_id')->constrained()->cascadeOnDelete();
        });
    }

    protected function configureAuthEvents(): void
    {
        Event::listen(Login::class, function (Login $event) {
            if ($event->user instanceof User) {
                $event->user->forceFill(['last_login_at' => now()])->saveQuietly();
                // Every sign-in starts in the user's home context (platform console for super admins).
                if (request()->hasSession()) {
                    request()->session()->forget('school_id');
                }
            }
        });

        Event::listen(Failed::class, function (Failed $event) {
            AuditLogger::log('login_failed', null, 'Failed login for '.($event->credentials['email'] ?? 'unknown'), module: 'security');
        });
    }
}
