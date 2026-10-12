<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Admin\SubscriptionController as TenantSubscription;
use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Services\Website\WebsiteEntitlements;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Subscription plans and feature entitlements (SRS 3.4). */
class PlanController extends Controller
{
    public function index(): Response
    {
        $plans = Plan::withCount('tenants')->orderBy('price')->get()->map(fn (Plan $p) => [
            ...TenantSubscription::planArray($p),
            'tenants_count' => $p->tenants_count,
            'website_features' => WebsiteEntitlements::resolve($p),
            'website_tier' => WebsiteEntitlements::tierFor($p),
        ]);

        return Inertia::render('saas/plans', [
            'plans' => $plans,
            'templates' => collect(config('website.templates'))->map(fn ($t, $key) => ['value' => $key, 'label' => $t['name']])->values(),
            'websiteDefaults' => config('website.plans'),
            'modules' => collect(config('permissions.modules'))->map(fn ($label, $key) => ['value' => $key, 'label' => $label])->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $plan = Plan::create($this->validated($request));
        $this->audit('plan_created', $plan, "Created plan {$plan->name}", 'saas', null, $plan->only(['price', 'billing_interval', 'max_students', 'max_users']));
        $this->toast("Plan {$plan->name} created.");

        return back();
    }

    public function update(Request $request, Plan $plan): RedirectResponse
    {
        $data = $this->validated($request, $plan);
        $old = $plan->only(array_keys($data));
        $plan->update($data);
        $this->audit('plan_updated', $plan, "Updated plan {$plan->name}", 'saas', $old, $plan->only(array_keys($data)));
        $this->toast("Plan {$plan->name} saved.");

        return back();
    }

    public function destroy(Plan $plan): RedirectResponse
    {
        if ($plan->tenants()->exists() || \App\Models\Subscription::where('plan_id', $plan->id)->exists()) {
            $plan->update(['is_active' => false]);
            $this->audit('plan_deactivated', $plan, "Deactivated plan {$plan->name} (in use)", 'saas');
            $this->toast('This plan is in use, so it was deactivated instead of deleted.', 'warning');

            return back();
        }

        $plan->delete();
        $this->audit('plan_deleted', $plan, "Deleted plan {$plan->name}", 'saas');
        $this->toast('Plan deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Plan $plan = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'code' => ['required', 'string', 'max:40', 'alpha_dash', Rule::unique('plans', 'code')->ignore($plan?->id)],
            'price' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'billing_interval' => ['required', Rule::in(['monthly', 'termly', 'yearly'])],
            'max_students' => ['nullable', 'integer', 'min:1'],
            'max_users' => ['nullable', 'integer', 'min:1'],
            'max_schools' => ['required', 'integer', 'min:1', 'max:1000'],
            'sms_credits' => ['required', 'integer', 'min:0'],
            'modules' => ['present', 'array'],
            'modules.*' => [Rule::in(array_keys(config('permissions.modules')))],
            'is_active' => ['boolean'],
            'website_features' => ['nullable', 'array'],
            'website_features.templates' => ['required_with:website_features', 'array', 'min:1'],
            'website_features.templates.*' => [Rule::in(array_keys(config('website.templates')))],
            'website_features.max_pages' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'website_features.max_gallery' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'website_features.news' => ['boolean'],
            'website_features.gallery' => ['boolean'],
            'website_features.online_admission' => ['boolean'],
            'website_features.document_uploads' => ['boolean'],
            'website_features.custom_domain' => ['boolean'],
            'website_features.remove_branding' => ['boolean'],
        ], [], ['website_features.templates' => 'website templates']);
    }
}
