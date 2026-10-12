<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Public school websites + CMS: per-school site settings (template, theme,
 * home-page content), custom pages, news & events posts, gallery, contact
 * enquiries, and online admission applications flowing into Admissions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schools', function (Blueprint $table) {
            $table->string('slug')->nullable()->unique()->after('name');
        });
        foreach (DB::table('schools')->get(['id', 'name']) as $s) {
            $base = Str::slug($s->name) ?: 'school';
            $slug = $base;
            $n = 2;
            while (DB::table('schools')->where('slug', $slug)->where('id', '!=', $s->id)->exists()) {
                $slug = $base.'-'.$n++;
            }
            DB::table('schools')->where('id', $s->id)->update(['slug' => $slug]);
        }

        Schema::create('school_websites', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('template')->default('modern');          // modern | classic | minimal | playful
            $table->boolean('is_published')->default(false);
            $table->string('custom_domain')->nullable()->unique();
            $table->string('primary_color', 9)->default('#4361ee');
            $table->string('secondary_color', 9)->default('#805dca');
            $table->string('tagline')->nullable();
            $table->string('hero_title')->nullable();
            $table->text('hero_subtitle')->nullable();
            $table->string('hero_image_path')->nullable();
            $table->string('about_title')->nullable();
            $table->longText('about_body')->nullable();
            $table->string('about_image_path')->nullable();
            $table->text('mission')->nullable();
            $table->text('vision')->nullable();
            $table->text('core_values')->nullable();
            $table->string('head_name')->nullable();
            $table->string('head_title')->nullable();
            $table->text('head_message')->nullable();
            $table->string('head_photo_path')->nullable();
            $table->json('highlights')->nullable();      // [{icon,title,text}]
            $table->json('testimonials')->nullable();    // [{name,role,quote}]
            $table->json('faqs')->nullable();            // [{question,answer}]
            $table->json('sections')->nullable();        // toggles: stats, news, events, gallery, testimonials, faqs, fees, leadership
            $table->json('contact')->nullable();         // phone, email, address, map_embed_url, office_hours
            $table->json('social')->nullable();          // facebook, instagram, x, youtube, whatsapp, linkedin
            $table->json('admission_settings')->nullable(); // enabled, intro, academic_year_id, classes[], require_documents, fee_note, closing_date
            $table->string('seo_title')->nullable();
            $table->string('seo_description', 300)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique('school_id');
        });

        Schema::create('website_pages', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('title');
            $table->string('slug');
            $table->string('summary', 300)->nullable();
            $table->longText('body')->nullable();          // sanitised HTML from the editor
            $table->string('cover_image_path')->nullable();
            $table->boolean('show_in_menu')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_published')->default(true);
            $table->timestamps();
            $table->unique(['school_id', 'slug']);
        });

        Schema::create('website_posts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('type')->default('news');       // news | event | notice
            $table->string('title');
            $table->string('slug');
            $table->string('excerpt', 400)->nullable();
            $table->longText('body')->nullable();
            $table->string('cover_image_path')->nullable();
            $table->dateTime('event_starts_at')->nullable();
            $table->dateTime('event_ends_at')->nullable();
            $table->string('event_location')->nullable();
            $table->boolean('is_featured')->default(false);
            $table->string('status')->default('draft');    // draft | published
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'slug']);
            $table->index(['school_id', 'status', 'published_at']);
        });

        Schema::create('website_media', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('album')->default('General');
            $table->string('title')->nullable();
            $table->string('caption', 300)->nullable();
            $table->string('file_path');
            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_published')->default(true);
            $table->timestamps();
        });

        Schema::create('website_inquiries', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('subject')->nullable();
            $table->text('message');
            $table->string('status')->default('new');      // new | replied | closed
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
        });

        Schema::table('admission_applications', function (Blueprint $table) {
            $table->string('source')->default('office')->after('status');   // office | online
            $table->string('guardian_occupation')->nullable()->after('guardian_email');
            $table->string('nationality')->nullable()->after('date_of_birth');
            $table->json('documents')->nullable()->after('notes');           // [{title, path, size}]
            $table->string('tracking_code', 16)->nullable()->after('application_no');
            $table->string('submitted_ip', 45)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('admission_applications', function (Blueprint $table) {
            $table->dropColumn(['source', 'guardian_occupation', 'nationality', 'documents', 'tracking_code', 'submitted_ip']);
        });
        Schema::dropIfExists('website_inquiries');
        Schema::dropIfExists('website_media');
        Schema::dropIfExists('website_posts');
        Schema::dropIfExists('website_pages');
        Schema::dropIfExists('school_websites');
        Schema::table('schools', fn (Blueprint $table) => $table->dropColumn('slug'));
    }
};
