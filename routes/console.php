<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// SMS: send anything left queued (safety net for the background job) and pull Beem delivery reports.
// Production needs the scheduler cron: * * * * * php artisan schedule:run
Schedule::command('sms:send-queued')->everyMinute()->withoutOverlapping();
Schedule::command('sms:sync-delivery')->everyTenMinutes()->withoutOverlapping();
