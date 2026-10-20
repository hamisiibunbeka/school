<?php

use App\Support\InvoiceLayouts\InvoiceLayoutLibrary;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Invoice layouts:
 * - invoice_templates: the platform's sample layouts. A school that chooses one claims it exclusively
 *   (claimed_by_school_id) and it disappears from every other school's gallery.
 * - invoice_layouts: the school's own editable copy (fonts, sizes, block order, extra blocks …) used to print invoices.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_templates', function (Blueprint $table) {
            $table->id();
            $table->string('code', 60)->unique();
            $table->string('name');
            $table->string('description')->nullable();
            $table->json('layout');
            $table->foreignId('claimed_by_school_id')->nullable()->unique()->constrained('schools')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('invoice_layouts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('invoice_template_id')->nullable()->constrained()->nullOnDelete();
            $table->json('layout');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('school_id');
        });

        InvoiceLayoutLibrary::sync();
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_layouts');
        Schema::dropIfExists('invoice_templates');
    }
};
