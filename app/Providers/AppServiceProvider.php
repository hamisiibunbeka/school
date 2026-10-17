<?php

namespace App\Providers;

use App\Models\User;
use App\Services\AuditLogger;
use App\Services\Messaging\Beem\BeemClient;
use App\Services\Messaging\Beem\BeemSmsGateway;
use App\Services\Messaging\LogSmsGateway;
use App\Services\Messaging\MailGateway;
use App\Services\Messaging\MessageGateway;
use App\Services\Messaging\SmsCredits;
use App\Services\Messaging\SmsGateway;
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

        // Outbound messages: SMS through the provider (SMS_DRIVER=beem sends through Beem Africa,
        // anything else only logs) metered against the account's SMS credits; email through Laravel Mail.
        $this->app->bind(SmsGateway::class, fn ($app) => new MessageGateway(
            config('services.sms.driver') === 'beem' ? new BeemSmsGateway(BeemClient::fromConfig()) : new LogSmsGateway,
            $app->make(MailGateway::class),
            $app->make(SmsCredits::class),
        ));
    }

    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureAuthorization();
        $this->configureSchemaMacros();
        $this->configureAuthEvents();
        $this->configureUploadMessages();
    }

    /**
     * PHP drops files above upload_max_filesize before Laravel sees them, and the
     * default message ("The file failed to upload.") hides why. Say it plainly.
     */
    protected function configureUploadMessages(): void
    {
        $limit = self::uploadLimitMb();

        $this->app['translator']->addLines([
            'validation.uploaded' => "The :attribute could not be uploaded. It is probably larger than the server allows ({$limit} MB) — try a smaller file or a compressed/scanned-at-lower-quality PDF.",
        ], 'en');
    }

    /** Effective per-file upload limit in MB (the smaller of upload_max_filesize and post_max_size). */
    public static function uploadLimitMb(): float
    {
        $bytes = function (string $v): float {
            $v = trim($v);
            $n = (float) $v;

            return match (strtolower(substr($v, -1))) {
                'g' => $n * 1024 ** 3,
                'm' => $n * 1024 ** 2,
                'k' => $n * 1024,
                default => $n,
            };
        };

        $limit = min($bytes((string) ini_get('upload_max_filesize')), $bytes((string) ini_get('post_max_size')));

        return round($limit / 1024 ** 2, 1);
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
