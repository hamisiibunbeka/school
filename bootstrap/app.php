<?php

use App\Http\Middleware\EnsureSchoolSelected;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetSchoolContext;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            HandleAppearance::class,
            SetSchoolContext::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'school' => EnsureSchoolSelected::class,
        ]);

        // The school context must exist before route-model binding resolves {student} etc.,
        // so that bound models are always filtered by the tenant scope.
        $middleware->prependToPriorityList(
            before: SubstituteBindings::class,
            prepend: SetSchoolContext::class,
        );

        $middleware->redirectGuestsTo('/login');
        $middleware->redirectUsersTo('/dashboard');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Friendly Vristo-styled error pages for Inertia requests (non-debug).
        $exceptions->respond(function (Response $response, Throwable $e, Request $request) {
            if (! app()->hasDebugModeEnabled() && in_array($response->getStatusCode(), [403, 404, 500, 503])) {
                return Inertia::render('error', ['status' => $response->getStatusCode()])
                    ->toResponse($request)
                    ->setStatusCode($response->getStatusCode());
            }

            if ($response->getStatusCode() === 403 && $request->header('X-Inertia')) {
                return Inertia::render('error', ['status' => 403])
                    ->toResponse($request)
                    ->setStatusCode(403);
            }

            // Whole request above post_max_size: PHP discards everything, so go back with a clear message.
            if ($response->getStatusCode() === 413 && ! $request->expectsJson()) {
                $limit = AppServiceProvider::uploadLimitMb();
                Inertia::flash('toast', ['type' => 'error', 'message' => "The upload is too large — the server accepts up to {$limit} MB. Try a smaller file."]);

                return back();
            }

            if ($response->getStatusCode() === 419) {
                Inertia::flash('toast', ['type' => 'error', 'message' => 'The page expired, please try again.']);

                return back();
            }

            return $response;
        });
    })->create();
