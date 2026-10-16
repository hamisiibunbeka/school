<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('message_logs', function (Blueprint $table) {
            $table->string('provider', 30)->nullable()->after('status');        // log | beem
            $table->timestamp('delivery_checked_at')->nullable()->after('error'); // last delivery-report poll
            $table->timestamp('delivered_at')->nullable()->after('delivery_checked_at');
            $table->index(['provider', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('message_logs', function (Blueprint $table) {
            $table->dropIndex(['provider', 'status']);
            $table->dropColumn(['provider', 'delivery_checked_at', 'delivered_at']);
        });
    }
};
