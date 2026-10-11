<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Tracks when in-app notifications were fanned out for an announcement (prevents duplicate sends). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('announcements', 'notified_at')) {
            Schema::table('announcements', function (Blueprint $table) {
                $table->timestamp('notified_at')->nullable()->after('expires_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('announcements', 'notified_at')) {
            Schema::table('announcements', function (Blueprint $table) {
                $table->dropColumn('notified_at');
            });
        }
    }
};
