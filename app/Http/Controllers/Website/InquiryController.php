<?php

namespace App\Http\Controllers\Website;

use App\Http\Controllers\Controller;
use App\Models\WebsiteInquiry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Messages sent from the website contact form. */
class InquiryController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = ['search' => $request->string('search')->toString(), 'status' => $request->string('status')->toString()];

        return Inertia::render('website/inquiries', [
            'inquiries' => WebsiteInquiry::query()
                ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")->orWhere('phone', 'like', "%{$s}%")->orWhere('message', 'like', "%{$s}%")))
                ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
                ->latest()->paginate($this->perPage())->withQueryString(),
            'filters' => $filters,
            'counts' => WebsiteInquiry::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status'),
            'canManage' => $request->user()->can('website.manage'),
        ]);
    }

    public function update(Request $request, WebsiteInquiry $inquiry): RedirectResponse
    {
        $inquiry->update($request->validate(['status' => ['required', Rule::in(['new', 'replied', 'closed'])]]));
        $this->toast('Enquiry marked as '.$inquiry->status.'.');

        return back();
    }

    public function destroy(WebsiteInquiry $inquiry): RedirectResponse
    {
        $inquiry->delete();
        $this->toast('Enquiry deleted.');

        return back();
    }
}
