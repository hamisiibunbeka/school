<?php

namespace App\Services\Website;

use App\Models\Plan;
use App\Models\School;

/**
 * What a school's subscription plan allows on its public website
 * (templates, page/gallery limits, online admission, custom domain, branding).
 */
class WebsiteEntitlements
{
    /** @var array<string, mixed> */
    private array $features;

    public function __construct(private School $school)
    {
        $plan = $school->tenant?->plan;
        $this->features = $plan ? self::resolve($plan) : config('website.plans.starter');
    }

    public static function for(School $school): self
    {
        return new self($school->loadMissing('tenant.plan'));
    }

    /**
     * Effective website features for a plan: the plan's own overrides (edited in
     * SaaS Console → Plans) on top of the defaults for its tier.
     *
     * @return array<string, mixed>
     */
    public static function resolve(Plan $plan): array
    {
        return array_replace(config('website.plans.'.self::tierFor($plan)), array_intersect_key($plan->website_features ?? [], self::KEYS));
    }

    /**
     * Config tier used for defaults. Built-in plans match by code; custom plans
     * (e.g. "PREMIUM") inherit the richest built-in tier their yearly price covers.
     */
    public static function tierFor(Plan $plan): string
    {
        $tiers = config('website.plans');
        if (isset($tiers[$plan->code])) {
            return $plan->code;
        }

        $yearly = fn (Plan $p) => (float) $p->price * match ($p->billing_interval) { 'monthly' => 12, 'termly' => 3, default => 1 };
        $tier = Plan::whereIn('code', array_keys($tiers))->get()
            ->filter(fn (Plan $known) => $yearly($known) <= $yearly($plan))
            ->sortBy(fn (Plan $known) => $yearly($known))
            ->last()?->code;

        return $tier ?? 'starter';
    }

    /** Keys a plan may override. */
    public const KEYS = ['templates' => 1, 'max_pages' => 1, 'max_gallery' => 1, 'news' => 1, 'gallery' => 1, 'online_admission' => 1, 'document_uploads' => 1, 'custom_domain' => 1, 'remove_branding' => 1];

    public function plan(): string
    {
        return $this->school->tenant?->plan?->name ?? 'Starter';
    }

    /** @return array<int, string> */
    public function templates(): array
    {
        return $this->features['templates'] ?? ['modern'];
    }

    public function allowsTemplate(string $template): bool
    {
        return in_array($template, $this->templates(), true);
    }

    public function allows(string $feature): bool
    {
        return (bool) ($this->features[$feature] ?? false);
    }

    public function limit(string $key): ?int
    {
        return $this->features[$key] ?? null;
    }

    /** The tenant must be in good standing for its site to be reachable. */
    public function siteAvailable(): bool
    {
        $modules = $this->school->tenant?->plan?->modules;

        return (bool) $this->school->is_active
            && ($this->school->tenant?->isAccessible() ?? false)
            && ($modules === null || $modules === [] || in_array('website', $modules, true));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->features + ['plan' => $this->plan(), 'available' => $this->siteAvailable()];
    }
}
