<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------------- Boarding ----------------
        Schema::create('dormitories', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('gender', 10)->default('mixed'); // male | female | mixed
            $table->unsignedSmallInteger('capacity')->default(0);
            $table->foreignId('warden_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('dormitory_rooms', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('dormitory_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedSmallInteger('capacity')->default(1);
            $table->timestamps();
        });

        Schema::create('bed_allocations', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dormitory_room_id')->constrained()->cascadeOnDelete();
            $table->string('bed_no')->nullable();
            $table->foreignId('academic_year_id')->nullable()->constrained()->nullOnDelete();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->string('status')->default('active'); // active | ended
            $table->timestamps();
        });

        Schema::create('leave_passes', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->string('reason');
            $table->dateTime('departure_at');
            $table->dateTime('expected_return_at');
            $table->dateTime('returned_at')->nullable();
            $table->string('pickup_person')->nullable();
            $table->string('pickup_phone')->nullable();
            $table->string('status')->default('pending'); // pending | approved | rejected | out | returned
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('roll_calls', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('dormitory_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('session')->default('evening'); // morning | evening | night
            $table->string('status'); // present | absent | on_leave
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['student_id', 'date', 'session']);
        });

        Schema::create('visitor_logs', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('visitor_name');
            $table->string('phone')->nullable();
            $table->string('id_number')->nullable();
            $table->foreignId('student_id')->nullable()->constrained()->nullOnDelete();
            $table->string('purpose');
            $table->dateTime('check_in');
            $table->dateTime('check_out')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // ---------------- Transport ----------------
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('registration_no');
            $table->string('make')->nullable();
            $table->string('model')->nullable();
            $table->unsignedSmallInteger('capacity')->default(0);
            $table->foreignId('driver_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->date('insurance_expiry')->nullable();
            $table->date('inspection_expiry')->nullable();
            $table->date('next_service_date')->nullable();
            $table->string('status')->default('active'); // active | maintenance | retired
            $table->timestamps();
        });

        Schema::create('transport_routes', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('fare', 15, 2)->default(0); // per term
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('route_stops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transport_route_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->time('pickup_time')->nullable();
            $table->time('dropoff_time')->nullable();
            $table->unsignedSmallInteger('sequence')->default(1);
            $table->timestamps();
        });

        Schema::create('student_transports', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('transport_route_id')->constrained()->cascadeOnDelete();
            $table->foreignId('route_stop_id')->nullable()->constrained()->nullOnDelete();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();
        });

        Schema::create('vehicle_logs', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('vehicle_id')->constrained()->cascadeOnDelete();
            $table->string('type'); // fuel | maintenance | repair | inspection | trip | incident
            $table->date('date');
            $table->decimal('amount', 15, 2)->default(0);
            $table->decimal('litres', 8, 2)->nullable();
            $table->unsignedInteger('odometer')->nullable();
            $table->string('description')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // ---------------- Inventory & procurement ----------------
        Schema::create('item_categories', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('item_category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('sku')->nullable();
            $table->string('unit')->default('pcs');
            $table->decimal('unit_cost', 15, 2)->default(0); // weighted average
            $table->decimal('quantity', 15, 2)->default(0);
            $table->decimal('reorder_level', 15, 2)->default(0);
            $table->string('location')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('po_no');
            $table->foreignId('supplier_id')->constrained();
            $table->date('order_date');
            $table->date('expected_date')->nullable();
            $table->decimal('total', 15, 2)->default(0);
            $table->string('status')->default('draft'); // draft | approved | received | cancelled
            $table->string('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'po_no']);
        });

        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 15, 2);
            $table->decimal('unit_cost', 15, 2);
            $table->decimal('received_quantity', 15, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->string('type'); // receipt | issue | adjustment | return | write_off
            $table->decimal('quantity', 15, 2); // signed: + in, - out
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('balance_after', 15, 2)->default(0);
            $table->date('date');
            $table->string('reference')->nullable();
            $table->foreignId('purchase_order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('issued_to')->nullable(); // department / kitchen / class
            $table->string('notes')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        // ---------------- Library ----------------
        Schema::create('books', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('title');
            $table->string('author')->nullable();
            $table->string('isbn')->nullable();
            $table->string('publisher')->nullable();
            $table->string('category')->nullable();
            $table->string('shelf')->nullable();
            $table->unsignedSmallInteger('copies_total')->default(1);
            $table->unsignedSmallInteger('copies_available')->default(1);
            $table->timestamps();
        });

        Schema::create('book_loans', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('issued_on');
            $table->date('due_on');
            $table->date('returned_on')->nullable();
            $table->decimal('fine', 15, 2)->default(0);
            $table->string('status')->default('issued'); // issued | returned | lost
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // ---------------- Health ----------------
        Schema::create('health_visits', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->dateTime('visited_at');
            $table->string('complaint');
            $table->text('treatment')->nullable();
            $table->string('referred_to')->nullable();
            $table->boolean('guardian_notified')->default(false);
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // ---------------- Communication ----------------
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('title');
            $table->text('body');
            $table->string('audience')->default('all'); // all | staff | parents | students | class
            $table->foreignId('school_class_id')->nullable()->constrained()->nullOnDelete();
            $table->string('priority')->default('normal'); // normal | important | urgent
            $table->timestamp('publish_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('channel')->default('sms'); // sms | email
            $table->string('subject')->nullable();
            $table->text('body'); // supports {student_name}, {balance}, {school_name} ...
            $table->timestamps();
        });

        Schema::create('message_logs', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('channel'); // sms | email | in_app
            $table->string('recipient');
            $table->string('recipient_name')->nullable();
            $table->string('subject')->nullable();
            $table->text('message');
            $table->string('status')->default('queued'); // queued | sent | delivered | failed
            $table->string('provider_reference')->nullable();
            $table->string('error')->nullable();
            $table->unsignedSmallInteger('credits')->default(1);
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['school_id', 'created_at']);
        });
    }

    public function down(): void
    {
        foreach ([
            'message_logs', 'message_templates', 'announcements', 'health_visits', 'book_loans',
            'books', 'stock_movements', 'purchase_order_items', 'purchase_orders', 'inventory_items',
            'item_categories', 'vehicle_logs', 'student_transports', 'route_stops', 'transport_routes',
            'vehicles', 'visitor_logs', 'roll_calls', 'leave_passes', 'bed_allocations',
            'dormitory_rooms', 'dormitories',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
