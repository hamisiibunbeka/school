<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** In-app notification centre (SRS 4.18). */
class NotificationController extends Controller
{
    public function index(Request $request): Response
    {
        $notifications = $request->user()->notifications()->latest()->paginate(20)->through(fn ($n) => [
            'id' => $n->id,
            'title' => $n->data['title'] ?? 'Notification',
            'message' => $n->data['message'] ?? '',
            'url' => $n->data['url'] ?? null,
            'type' => $n->data['type'] ?? 'info',
            'read_at' => $n->read_at,
            'created_at' => $n->created_at,
            'time' => $n->created_at->diffForHumans(),
        ]);

        return Inertia::render('notifications', ['notifications' => $notifications]);
    }

    public function readAll(Request $request): RedirectResponse
    {
        $request->user()->unreadNotifications->markAsRead();
        $this->toast('All notifications marked as read');

        return back();
    }
}
