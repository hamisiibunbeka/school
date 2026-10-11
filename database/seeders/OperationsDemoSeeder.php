<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\BedAllocation;
use App\Models\Book;
use App\Models\BookLoan;
use App\Models\Dormitory;
use App\Models\Employee;
use App\Models\HealthVisit;
use App\Models\InventoryItem;
use App\Models\ItemCategory;
use App\Models\LeavePass;
use App\Models\PurchaseOrder;
use App\Models\Student;
use App\Models\StudentTransport;
use App\Models\Supplier;
use App\Models\TransportRoute;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\VehicleLog;
use App\Models\VisitorLog;
use App\Services\DocumentNumber;
use App\Services\Inventory\StockService;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Demo data for Boarding, Transport, Inventory & Procurement, Library and Health.
 * Runs inside the demo school's tenancy context (called by DatabaseSeeder).
 */
class OperationsDemoSeeder extends Seeder
{
    private CarbonImmutable $today;

    private int $schoolId;

    private int $tenantId;

    /** @var array<string, int|null> */
    private array $users = [];

    public function run(): void
    {
        mt_srand(20261010);
        $tenancy = app(Tenancy::class);
        $this->schoolId = (int) $tenancy->schoolId();
        $this->tenantId = (int) $tenancy->tenantId();
        $this->today = CarbonImmutable::today();

        foreach (['store', 'bursar', 'boarding', 'library', 'transport', 'principal', 'admin'] as $key) {
            $this->users[$key] = User::where('email', "{$key}@mzenzi.test")->value('id');
        }

        $this->boarding();
        $this->transport();
        $this->inventory();
        $this->library();
        $this->health();
    }

    // ------------------------------------------------------------------ Boarding

    private function boarding(): void
    {
        $boardingMaster = Employee::where('designation', 'Boarding Master')->value('id');
        $matron = Employee::where('designation', 'Matron')->value('id');
        $maleTeacher = Employee::where('category', 'teaching')->where('gender', 'male')->orderBy('id')->skip(1)->value('id');
        $femaleTeacher = Employee::where('category', 'teaching')->where('gender', 'female')->orderBy('id')->skip(2)->value('id');

        $dorms = [
            ['Kilimanjaro House', 'male', $boardingMaster, 'Main boys hostel, Block A'],
            ['Serengeti House', 'male', $maleTeacher, 'Boys hostel, Block B (Forms Three & Four)'],
            ['Ngorongoro House', 'female', $matron, 'Main girls hostel, Block C'],
            ['Mikumi House', 'female', $femaleTeacher, 'Girls hostel, Block D (Forms Three & Four)'],
        ];

        $rooms = ['male' => collect(), 'female' => collect()];
        foreach ($dorms as [$name, $gender, $warden, $description]) {
            $dorm = Dormitory::create(['name' => $name, 'gender' => $gender, 'warden_id' => $warden, 'description' => $description]);
            foreach (range(1, 4) as $n) {
                $rooms[$gender]->push($dorm->rooms()->create(['name' => 'Room '.substr($name, 0, 1).$n, 'capacity' => 6]));
            }
            $dorm->syncCapacity();
        }

        $yearId = AcademicYear::current()?->id;
        $start = AcademicYear::current()?->start_date?->toDateString() ?? $this->today->startOfYear()->toDateString();

        $boarders = Student::where('status', 'active')->where('residence_type', 'boarding')->orderBy('school_class_id')->orderBy('first_name')->get();
        foreach (['male', 'female'] as $gender) {
            $list = $boarders->where('gender', $gender)->values();
            $roomList = $rooms[$gender]->values();
            $fill = array_fill(0, $roomList->count(), 0);
            foreach ($list as $i => $student) {
                // Spread evenly across rooms (room-major round robin).
                $r = $i % $roomList->count();
                if ($fill[$r] >= $roomList[$r]->capacity) {
                    continue;
                }
                $fill[$r]++;
                BedAllocation::create([
                    'student_id' => $student->id,
                    'dormitory_room_id' => $roomList[$r]->id,
                    'bed_no' => (string) $fill[$r],
                    'academic_year_id' => $yearId,
                    'start_date' => max($start, $student->admission_date?->toDateString() ?? $start),
                    'status' => 'active',
                ]);
            }
        }

        // Leave passes (one overdue)
        $guardianOf = function (Student $s): array {
            $g = $s->guardians()->first();

            return [$g?->full_name ?? 'Parent', $g?->phone ?? '0754 000 000'];
        };
        $reasons = ['Weekend home visit', 'Medical appointment at Muhimbili', 'Family wedding in Moshi', 'Dental check-up', 'Mid-term break', 'Funeral of grandparent', 'Passport application at Immigration', 'Sibling graduation'];
        $passes = [
            // [status, departure offset days, duration hours]
            ['pending', 2, 52], ['pending', 3, 48],
            ['approved', 1, 50],
            ['out', -1, 60], ['out', -4, 72], // second one is overdue
            ['returned', -9, 52], ['returned', -16, 48], ['returned', -23, 60], ['returned', -30, 50], ['returned', -38, 48],
            ['rejected', -12, 48],
        ];
        $sample = $boarders->shuffle()->take(count($passes))->values();
        foreach ($passes as $i => [$status, $offset, $hours]) {
            $student = $sample[$i] ?? null;
            if (! $student) {
                break;
            }
            [$pickup, $phone] = $guardianOf($student);
            $departure = $this->today->addDays($offset)->setTime(15, 30);
            $expected = $departure->addHours($hours);
            LeavePass::create([
                'student_id' => $student->id,
                'reason' => $reasons[$i % count($reasons)],
                'departure_at' => $departure,
                'expected_return_at' => $expected,
                'returned_at' => $status === 'returned' ? $expected->subMinutes(mt_rand(-90, 120)) : null,
                'pickup_person' => $pickup,
                'pickup_phone' => $phone,
                'status' => $status,
                'approved_by' => in_array($status, ['approved', 'out', 'returned', 'rejected'], true) ? $this->users['boarding'] : null,
            ]);
        }

        // Roll calls for the last 3 days
        $onLeave = LeavePass::where('status', 'out')->pluck('departure_at', 'student_id');
        $allocations = BedAllocation::with('room:id,dormitory_id')->where('status', 'active')->get();
        $rows = [];
        $now = now();
        foreach (range(3, 1) as $daysAgo) {
            $date = $this->today->subDays($daysAgo);
            foreach (['morning', 'evening', 'night'] as $session) {
                foreach ($allocations as $a) {
                    $leave = isset($onLeave[$a->student_id]) && CarbonImmutable::parse($onLeave[$a->student_id])->lte($date->endOfDay());
                    $rows[] = [
                        'tenant_id' => $this->tenantId,
                        'school_id' => $this->schoolId,
                        'dormitory_id' => $a->room->dormitory_id,
                        'student_id' => $a->student_id,
                        'date' => $date->toDateString(),
                        'session' => $session,
                        'status' => $leave ? 'on_leave' : (mt_rand(1, 100) <= 2 ? 'absent' : 'present'),
                        'recorded_by' => $this->users['boarding'],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('roll_calls')->insert($chunk);
        }

        // Visitor log over the last month
        $visitors = ['Mwanaidi Said', 'Peter Kimaro', 'Rehema Mushi', 'Hassan Juma', 'Anna Lyimo', 'Joseph Massawe', 'Zawadi Mrema', 'Frank Shirima', 'Neema Mollel', 'Ibrahim Kombo', 'Grace Temba', 'Abdallah Mohamed', 'Lucy Urassa', 'Baraka Haule', 'Mariam Ally'];
        $purposes = ['Visiting day — brought provisions', 'Delivering pocket money and toiletries', 'Meeting with boarding master', 'Collecting school report', 'Dropping off uniform', 'Medical follow-up', 'Visiting child after illness'];
        $students = Student::where('status', 'active')->where('residence_type', 'boarding')->inRandomOrder()->limit(30)->pluck('id');
        foreach (range(0, 24) as $i) {
            $daysAgo = $i < 3 ? 0 : mt_rand(1, 30);
            $in = $this->today->subDays($daysAgo)->setTime(mt_rand(9, 16), [0, 15, 30, 45][mt_rand(0, 3)]);
            VisitorLog::create([
                'visitor_name' => $visitors[$i % count($visitors)],
                'phone' => '07'.mt_rand(10, 79).' '.mt_rand(100, 999).' '.mt_rand(100, 999),
                'id_number' => mt_rand(0, 2) ? '1980'.mt_rand(1000, 9999).'-'.mt_rand(10000, 99999).'-'.mt_rand(10000, 99999).'-'.mt_rand(10, 29) : null,
                'student_id' => $students[$i % max(1, $students->count())] ?? null,
                'purpose' => $purposes[$i % count($purposes)],
                'check_in' => $in,
                'check_out' => $daysAgo === 0 && $i < 2 ? null : $in->addMinutes(mt_rand(25, 150)),
                'recorded_by' => $this->users['boarding'],
            ]);
        }
    }

    // ------------------------------------------------------------------ Transport

    private function transport(): void
    {
        $drivers = Employee::where('designation', 'Driver')->orderBy('id')->pluck('id')->all();
        $officer = Employee::where('designation', 'Transport Officer')->value('id');
        $guard = Employee::where('designation', 'Security Guard')->value('id');

        $t = $this->today;
        $vehicles = [
            ['T 245 DKL', 'Toyota', 'Coaster', 30, $drivers[0] ?? null, $t->addDays(12), $t->addMonths(5), $t->addDays(40)],      // insurance due soon
            ['T 512 DMA', 'Isuzu', 'Journey', 33, $drivers[1] ?? null, $t->addMonths(7), $t->subDays(6), $t->addDays(21)],         // inspection expired
            ['T 881 DGF', 'Nissan', 'Civilian', 29, $officer, $t->addMonths(4), $t->addMonths(3), $t->addMonths(2)],
            ['T 337 DNB', 'Toyota', 'Hiace', 14, $guard, $t->addMonths(9), $t->addMonths(6), $t->addDays(55)],
        ];
        $v = [];
        foreach ($vehicles as [$reg, $make, $model, $cap, $driver, $ins, $insp, $service]) {
            $v[] = Vehicle::create([
                'registration_no' => $reg, 'make' => $make, 'model' => $model, 'capacity' => $cap, 'driver_id' => $driver,
                'insurance_expiry' => $ins->toDateString(), 'inspection_expiry' => $insp->toDateString(), 'next_service_date' => $service->toDateString(), 'status' => 'active',
            ]);
        }

        $routes = [
            ['Route A — Mbezi Beach', 0, 380000, 'Bagamoyo Road via Mbezi Beach', [['Mbezi Beach (Tangi Bovu)', '06:05', '16:55'], ['Africana', '06:15', '16:45'], ['Kawe', '06:30', '16:30'], ['Mwenge', '06:45', '16:15']]],
            ['Route B — Tegeta / Bunju', 1, 420000, 'Tegeta, Boko and Bunju', [['Bunju B', '05:50', '17:10'], ['Boko', '06:00', '17:00'], ['Tegeta Nyuki', '06:15', '16:45'], ['Kunduchi', '06:25', '16:35'], ['Lugalo', '06:40', '16:20']]],
            ['Route C — Kimara / Ubungo', 2, 350000, 'Morogoro Road corridor', [['Kimara Mwisho', '06:00', '17:00'], ['Kimara Korogwe', '06:10', '16:50'], ['Ubungo Riverside', '06:25', '16:35'], ['Mabibo', '06:40', '16:20']]],
            ['Route D — Sinza / Mwenge', 3, 300000, 'Inner city loop (van)', [['Sinza Kijiweni', '06:20', '16:40'], ['Sinza Mori', '06:28', '16:32'], ['Makumbusho', '06:40', '16:20']]],
        ];
        $routeModels = [];
        foreach ($routes as [$name, $vi, $fare, $desc, $stops]) {
            $route = TransportRoute::create(['name' => $name, 'vehicle_id' => $v[$vi]->id, 'fare' => $fare, 'description' => $desc]);
            foreach ($stops as $i => [$stop, $pick, $drop]) {
                $route->stops()->create(['name' => $stop, 'pickup_time' => $pick, 'dropoff_time' => $drop, 'sequence' => $i + 1]);
            }
            $routeModels[] = $route->load('stops', 'vehicle');
        }

        // ~45 day students across the routes, within each vehicle's capacity.
        $dayStudents = Student::where('status', 'active')->where('residence_type', 'day')->inRandomOrder()->limit(45)->get();
        $quota = [13, 13, 11, 8];
        $termStart = $this->today->month >= 7 ? $this->today->setDate($this->today->year, 7, 6) : $this->today->setDate($this->today->year, 1, 8);
        $idx = 0;
        foreach ($routeModels as $ri => $route) {
            for ($k = 0; $k < $quota[$ri] && $idx < $dayStudents->count(); $k++, $idx++) {
                $stops = $route->stops;
                StudentTransport::create([
                    'student_id' => $dayStudents[$idx]->id,
                    'transport_route_id' => $route->id,
                    'route_stop_id' => $stops[mt_rand(0, $stops->count() - 1)]->id,
                    'start_date' => mt_rand(0, 4) ? $termStart->subMonths(6)->toDateString() : $termStart->toDateString(),
                    'status' => 'active',
                ]);
            }
        }
        // A couple of ended assignments for history
        foreach (Student::where('status', 'active')->where('residence_type', 'day')->whereNotIn('id', $dayStudents->pluck('id'))->limit(2)->get() as $s) {
            StudentTransport::create([
                'student_id' => $s->id, 'transport_route_id' => $routeModels[2]->id, 'route_stop_id' => $routeModels[2]->stops[0]->id,
                'start_date' => $termStart->subMonths(6)->toDateString(), 'end_date' => $termStart->subDays(10)->toDateString(), 'status' => 'ended',
            ]);
        }

        // Fuel & maintenance logs since May
        $stations = ['Puma Mwenge', 'Total Ubungo', 'Oryx Tegeta', 'Lake Oil Kimara', 'GBP Mbezi'];
        foreach ($v as $vi => $vehicle) {
            $odo = [86000, 124500, 61200, 43800][$vi];
            $date = $this->today->setDate($this->today->year, 5, 2)->addDays($vi);
            $perKm = $vi === 3 ? 0.11 : 0.22;
            while ($date->lte($this->today)) {
                $km = mt_rand(380, 520);
                $odo += $km;
                $litres = round($km * $perKm + mt_rand(-5, 5), 1);
                $price = mt_rand(3080, 3250);
                VehicleLog::create([
                    'vehicle_id' => $vehicle->id, 'type' => 'fuel', 'date' => $date->toDateString(),
                    'amount' => round($litres * $price, -2), 'litres' => $litres, 'odometer' => $odo,
                    'description' => 'Diesel — '.$stations[mt_rand(0, count($stations) - 1)], 'recorded_by' => $this->users['transport'],
                ]);
                $date = $date->addDays(mt_rand(8, 11));
            }
            foreach ([5, 7, 9] as $m) {
                $d = $this->today->setDate($this->today->year, $m, mt_rand(10, 25));
                VehicleLog::create([
                    'vehicle_id' => $vehicle->id, 'type' => 'maintenance', 'date' => $d->toDateString(),
                    'amount' => mt_rand(28, 65) * 10000, 'odometer' => (int) max(0, $odo - mt_rand(2000, 6000) * (10 - $m) / 5),
                    'description' => ['Routine service: oil, oil filter, air filter', 'Service: oil change, brake check, tyre rotation', 'Service: gearbox oil, wheel alignment'][$m % 3],
                    'recorded_by' => $this->users['transport'],
                ]);
            }
        }
        $extras = [
            [0, 'repair', 52, 780000, 'Replaced front brake pads and discs'],
            [1, 'inspection', 120, 150000, 'LATRA inspection fee (renewal pending)'],
            [2, 'repair', 34, 420000, 'Alternator rewound'],
            [1, 'incident', 18, 0, 'Minor side mirror damage in traffic at Ubungo; no injuries, police report filed'],
            [3, 'repair', 9, 260000, 'Replaced two rear tyres'],
            [0, 'trip', 25, 180000, 'Form Four educational trip to Bagamoyo ruins (tolls & allowances)'],
        ];
        foreach ($extras as [$vi, $type, $daysAgo, $amount, $desc]) {
            VehicleLog::create([
                'vehicle_id' => $v[$vi]->id, 'type' => $type, 'date' => $this->today->subDays($daysAgo)->toDateString(),
                'amount' => $amount, 'description' => $desc, 'recorded_by' => $this->users['transport'],
            ]);
        }
    }

    // ------------------------------------------------------------------ Inventory

    private function inventory(): void
    {
        $storeUser = User::find($this->users['store']);
        if ($storeUser) {
            auth()->login($storeUser);
        }

        $stock = app(StockService::class);

        $suppliers = collect([
            ['Kariakoo Wholesale Foods Ltd', 'Ramadhani Issa', '0713 456 221', 'sales@kariakoofoods.co.tz', 'Msimbazi St, Kariakoo, Dar es Salaam', '112-334-567'],
            ['Mwenge Stationers & Printers', 'Esther Mbise', '0754 887 102', 'orders@mwengestationers.co.tz', 'Mwenge, Sam Nujoma Rd, Dar es Salaam', '109-552-880'],
            ['Clean Pro Tanzania', 'Daniel Kweka', '0782 330 415', 'info@cleanpro.co.tz', 'Mikocheni Light Industrial Area', '121-008-443'],
            ['ScienceLab Supplies (T) Ltd', 'Dr. Paulo Nnko', '0767 210 908', 'lab@sciencelab.co.tz', 'Upanga, Dar es Salaam', '115-760-221'],
            ['Uhuru Sports House', 'Saidi Mkwawa', '0715 642 377', 'uhurusports@gmail.com', 'Uhuru St, Kariakoo', '118-904-336'],
        ])->map(fn ($s) => Supplier::create(['name' => $s[0], 'contact_person' => $s[1], 'phone' => $s[2], 'email' => $s[3], 'address' => $s[4], 'tin' => $s[5], 'is_active' => true]));

        $cats = collect(['Food & Kitchen', 'Stationery', 'Cleaning & Hygiene', 'Laboratory', 'Sports', 'Maintenance'])->mapWithKeys(fn ($n) => [$n => ItemCategory::create(['name' => $n])->id]);

        // [name, sku, unit, cost, reorder, opening, category, issued_to, weekly issue rate]
        $catalogue = [
            ['Rice (Super)', 'FD-RIC', 'kg', 2800, 300, 1500, 'Food & Kitchen', 'Kitchen', 0.036],
            ['Beans (Soya)', 'FD-BEA', 'kg', 3200, 150, 800, 'Food & Kitchen', 'Kitchen', 0.036],
            ['Maize flour (Sembe)', 'FD-MAZ', 'kg', 1500, 400, 2000, 'Food & Kitchen', 'Kitchen', 0.046],
            ['Cooking oil (Korie)', 'FD-OIL', 'litres', 5500, 60, 300, 'Food & Kitchen', 'Kitchen', 0.036],
            ['Sugar', 'FD-SUG', 'kg', 3000, 100, 500, 'Food & Kitchen', 'Kitchen', 0.035],
            ['Salt', 'FD-SAL', 'kg', 800, 20, 100, 'Food & Kitchen', 'Kitchen', 0.03],
            ['Tea leaves (Chai Bora)', 'FD-TEA', 'kg', 9000, 10, 50, 'Food & Kitchen', 'Kitchen', 0.034],
            ['Wheat flour', 'FD-WHE', 'kg', 2000, 80, 400, 'Food & Kitchen', 'Boarding', 0.034],
            ['Dagaa (dried sardines)', 'FD-DAG', 'kg', 12000, 30, 150, 'Food & Kitchen', 'Kitchen', 0.045],
            ['Charcoal', 'FD-CHA', 'bags', 45000, 10, 60, 'Food & Kitchen', 'Kitchen', 0.03],
            ['Exercise books (96 pages)', 'ST-EXB', 'dozens', 9600, 40, 200, 'Stationery', 'Form One', 0.03],
            ['A4 paper', 'ST-A4P', 'reams', 11500, 20, 120, 'Stationery', 'Administration', 0.035],
            ['Chalk (white)', 'ST-CHK', 'boxes', 3500, 30, 150, 'Stationery', 'Form Two', 0.03],
            ['Whiteboard markers', 'ST-MRK', 'boxes', 18000, 5, 30, 'Stationery', 'Form Three', 0.045],
            ['Ball pens (blue)', 'ST-PEN', 'boxes', 6000, 10, 50, 'Stationery', 'Administration', 0.03],
            ['Pencils HB', 'ST-PCL', 'boxes', 4500, 5, 30, 'Stationery', 'Form One', 0.025],
            ['Manila sheets', 'ST-MAN', 'pcs', 500, 50, 300, 'Stationery', 'Form Four', 0.025],
            ['Box files', 'ST-BOX', 'pcs', 4000, 10, 60, 'Stationery', 'Administration', 0.02],
            ['Printer toner (HP 05A)', 'ST-TON', 'pcs', 145000, 2, 8, 'Stationery', 'Administration', 0.04],
            ['Bar soap (Jamaa)', 'CL-SOP', 'cartons', 38000, 5, 30, 'Cleaning & Hygiene', 'Boarding', 0.035],
            ['Detergent powder (Omo)', 'CL-DET', 'kg', 5500, 20, 100, 'Cleaning & Hygiene', 'Boarding', 0.035],
            ['Toilet paper', 'CL-TOI', 'rolls', 700, 100, 600, 'Cleaning & Hygiene', 'Boarding', 0.04],
            ['Brooms', 'CL-BRM', 'pcs', 3500, 10, 40, 'Cleaning & Hygiene', 'Maintenance', 0.025],
            ['Floor mops', 'CL-MOP', 'pcs', 8000, 5, 20, 'Cleaning & Hygiene', 'Maintenance', 0.025],
            ['Bleach (Jik)', 'CL-JIK', 'litres', 4500, 15, 80, 'Cleaning & Hygiene', 'Maintenance', 0.035],
            ['Liquid hand wash', 'CL-HWS', 'litres', 6000, 10, 50, 'Cleaning & Hygiene', 'Clinic', 0.03],
            ['Hydrochloric acid (dilute)', 'LB-HCL', 'litres', 18000, 5, 20, 'Laboratory', 'Science Lab', 0.025],
            ['Sodium hydroxide pellets', 'LB-NAO', 'kg', 25000, 2, 10, 'Laboratory', 'Science Lab', 0.025],
            ['Copper(II) sulphate', 'LB-CUS', 'kg', 30000, 2, 6, 'Laboratory', 'Science Lab', 0.03],
            ['Litmus paper', 'LB-LIT', 'packets', 7000, 10, 40, 'Laboratory', 'Science Lab', 0.03],
            ['Test tubes', 'LB-TTB', 'pcs', 800, 50, 300, 'Laboratory', 'Science Lab', 0.025],
            ['Filter paper', 'LB-FIL', 'packets', 9000, 5, 25, 'Laboratory', 'Science Lab', 0.03],
            ['Ethanol 96%', 'LB-ETH', 'litres', 15000, 5, 15, 'Laboratory', 'Science Lab', 0.045],
            ['Footballs (size 5)', 'SP-FTB', 'pcs', 45000, 4, 12, 'Sports', 'Sports', 0.02],
            ['Netballs', 'SP-NTB', 'pcs', 40000, 3, 8, 'Sports', 'Sports', 0.02],
            ['Volleyballs', 'SP-VLB', 'pcs', 38000, 3, 8, 'Sports', 'Sports', 0.02],
            ['Sports jerseys (set of 15)', 'SP-JRS', 'sets', 350000, 1, 4, 'Sports', 'Sports', 0.012],
            ['Whistles', 'SP-WHS', 'pcs', 5000, 5, 20, 'Sports', 'Sports', 0.02],
            ['LED bulbs', 'MT-BLB', 'pcs', 6500, 20, 80, 'Maintenance', 'Maintenance', 0.03],
            ['Padlocks', 'MT-PAD', 'pcs', 12000, 5, 25, 'Maintenance', 'Boarding', 0.02],
        ];

        $items = [];
        $opening = $this->today->setDate($this->today->year, 5, 4);
        $openingValue = '0.00';
        foreach ($catalogue as $row) {
            [$name, $sku, $unit, $cost, $reorder, $qty, $cat] = $row;
            $item = InventoryItem::create([
                'item_category_id' => $cats[$cat], 'name' => $name, 'sku' => $sku, 'unit' => $unit,
                'reorder_level' => $reorder, 'location' => str_starts_with($sku, 'FD') ? 'Kitchen store' : (str_starts_with($sku, 'LB') ? 'Lab prep room' : 'Main store'),
                'is_active' => true, 'quantity' => 0, 'unit_cost' => 0,
            ]);
            $stock->receive($item, number_format($qty, 2, '.', ''), number_format($cost, 2, '.', ''), ['date' => $opening->toDateString(), 'reference' => 'OPENING', 'notes' => 'Opening stock count']);
            $openingValue = bcadd($openingValue, bcmul((string) $qty, (string) $cost, 2), 2);
            $items[$sku] = ['model' => $item, 'row' => $row];
        }
        $stock->postJournal($opening->toDateString(), 'Opening stores balance (stock count 4 May)', 'OPENING', [
            ['code' => '1400', 'debit' => $openingValue],
            ['code' => '3900', 'credit' => $openingValue],
        ]);

        // Purchase orders
        $po = function (Supplier $supplier, string $date, array $lines, string $status, ?string $expected = null, ?string $notes = null) use ($items): PurchaseOrder {
            $order = PurchaseOrder::create([
                'po_no' => DocumentNumber::next('purchase_order'), 'supplier_id' => $supplier->id, 'order_date' => $date,
                'expected_date' => $expected, 'status' => 'draft', 'notes' => $notes, 'created_by' => $this->users['store'],
            ]);
            $total = '0.00';
            foreach ($lines as [$sku, $qty, $cost]) {
                $order->items()->create(['inventory_item_id' => $items[$sku]['model']->id, 'quantity' => $qty, 'unit_cost' => $cost, 'received_quantity' => 0]);
                $total = bcadd($total, bcmul((string) $qty, (string) $cost, 2), 2);
            }
            $order->update(['total' => $total]);
            if ($status !== 'draft') {
                $order->update(['status' => 'approved', 'approved_by' => $this->users['bursar'] ?? $this->users['principal']]);
            }

            return $order;
        };

        $po1 = $po($suppliers[0], $this->today->setDate($this->today->year, 8, 4)->toDateString(), [['FD-RIC', 1200, 2750], ['FD-BEA', 500, 3150], ['FD-MAZ', 1500, 1450], ['FD-OIL', 200, 5600], ['FD-SUG', 300, 3050]], 'approved', $this->today->setDate($this->today->year, 8, 10)->toDateString(), 'Term II food supplies');
        $po2 = $po($suppliers[1], $this->today->subDays(20)->toDateString(), [['ST-EXB', 120, 9500], ['ST-A4P', 80, 11800], ['ST-CHK', 100, 3500], ['ST-TON', 6, 140000]], 'approved', $this->today->subDays(8)->toDateString(), 'Mock exam stationery');
        $po3 = $po($suppliers[3], $this->today->subDays(6)->toDateString(), [['LB-ETH', 20, 15500], ['LB-CUS', 8, 29500], ['LB-FIL', 20, 9000], ['LB-LIT', 30, 7200]], 'approved', $this->today->addDays(7)->toDateString(), 'Form Four practicals (NECTA)');
        $po4 = $po($suppliers[4], $this->today->subDays(2)->toDateString(), [['SP-FTB', 10, 45000], ['SP-NTB', 6, 42000], ['SP-WHS', 10, 5000]], 'draft', $this->today->addDays(14)->toDateString(), 'Inter-house games kit');

        // Weekly issues May → today, interleaved with PO receipts in date order.
        $events = [];
        for ($week = $opening->addDays(3); $week->lte($this->today); $week = $week->addWeek()) {
            $events[] = ['date' => $week, 'kind' => 'issue'];
        }
        $events[] = ['date' => $this->today->setDate($this->today->year, 8, 9), 'kind' => 'po1'];
        $events[] = ['date' => $this->today->subDays(9), 'kind' => 'po2'];
        $events[] = ['date' => $this->today->subDays(30), 'kind' => 'adj'];
        $events[] = ['date' => $this->today->subDays(15), 'kind' => 'wo'];
        $events[] = ['date' => $this->today->subDays(5), 'kind' => 'ret'];
        usort($events, fn ($a, $b) => $a['date'] <=> $b['date']);

        $classes = ['Form One', 'Form Two', 'Form Three', 'Form Four'];
        $monthly = [];
        foreach ($events as $event) {
            $date = $event['date']->toDateString();
            if ($event['kind'] === 'po1') {
                $stock->receivePurchaseOrder($po1, $po1->items->mapWithKeys(fn ($l) => [$l->id => (string) $l->quantity])->all(), $date, 'Delivered in full — DN 2231');
                continue;
            }
            if ($event['kind'] === 'po2') {
                $lines = $po2->items()->get();
                $stock->receivePurchaseOrder($po2, $lines->mapWithKeys(fn ($l, $i) => [$l->id => $i < 2 ? bcdiv((string) $l->quantity, '2', 2) : (string) $l->quantity])->all(), $date, 'Partial delivery — balance of exercise books and paper to follow');
                continue;
            }
            if (in_array($event['kind'], ['wo', 'adj', 'ret'], true)) {
                // Corrections, posted to the ledger individually.
                $m = match ($event['kind']) {
                    'wo' => $stock->move($items['FD-BEA']['model'], 'write_off', '-12.00', ['date' => $date, 'reference' => 'WO-001', 'notes' => 'Weevil-infested beans condemned by matron']),
                    'adj' => $stock->move($items['CL-TOI']['model'], 'adjustment', '-24.00', ['date' => $date, 'reference' => 'SC-0926', 'notes' => 'Stock count shortage']),
                    'ret' => $stock->move($items['ST-MAN']['model'], 'return', '15.00', ['date' => $date, 'issued_to' => 'Form Four', 'reference' => 'RTN-014', 'notes' => 'Unused manila sheets returned after project week']),
                };
                $stock->postMovement($m);
                continue;
            }
            foreach ($items as $sku => ['model' => $item, 'row' => $row]) {
                $rate = $row[8];
                $base = $row[5] * $rate * (mt_rand(80, 120) / 100);
                if ($row[2] === 'pcs' || $row[2] === 'sets' || $row[2] === 'boxes' || $row[2] === 'bags' || $row[2] === 'cartons' || $row[2] === 'dozens' || $row[2] === 'reams' || $row[2] === 'packets') {
                    $base = round($base);
                    if ($base < 1) {
                        if (mt_rand(1, 100) > (int) ($row[5] * $rate * 100)) {
                            continue;
                        }
                        $base = 1;
                    }
                } else {
                    $base = round($base, 1);
                }
                $available = (float) $item->quantity;
                $qty = min($base, $available);
                if ($qty <= 0) {
                    continue;
                }
                $issuedTo = in_array($row[7], $classes, true) ? $classes[mt_rand(0, 3)] : $row[7];
                $movement = $stock->move($item, 'issue', '-'.number_format($qty, 2, '.', ''), [
                    'date' => $date, 'issued_to' => $issuedTo, 'reference' => 'SRQ-'.$event['date']->format('W').'-'.substr($sku, 3),
                ]);
                $code = StockService::expenseAccountFor($issuedTo);
                $month = $event['date']->format('Y-m');
                $monthly[$month][$code] = bcadd($monthly[$month][$code] ?? '0.00', bcmul(number_format($qty, 2, '.', ''), (string) $movement->unit_cost, 2), 2);
            }
        }

        // Consolidated monthly stores-consumption journals.
        foreach ($monthly as $month => $byCode) {
            $date = CarbonImmutable::parse($month.'-01')->endOfMonth();
            $date = $date->gt($this->today) ? $this->today : $date;
            $total = array_reduce($byCode, fn ($c, $v) => bcadd($c, $v, 2), '0.00');
            if (bccomp($total, '0', 2) <= 0) {
                continue;
            }
            $lines = [];
            foreach ($byCode as $code => $value) {
                $lines[] = ['code' => (string) $code, 'debit' => $value];
            }
            $lines[] = ['code' => '1400', 'credit' => $total];
            $stock->postJournal($date->toDateString(), 'Stores consumption — '.$date->format('F Y'), 'STORES-'.$date->format('Ym'), $lines);
        }

        // Make sure a few items are visibly low.
        foreach (['FD-OIL', 'ST-MRK', 'LB-ETH', 'CL-HWS'] as $sku) {
            $item = $items[$sku]['model']->fresh();
            $target = bcmul((string) $item->reorder_level, '0.6', 2);
            if (bccomp((string) $item->quantity, $target, 2) > 0) {
                $qty = bcsub((string) $item->quantity, $target, 2);
                $m = $stock->move($item, 'issue', '-'.$qty, ['date' => $this->today->toDateString(), 'issued_to' => $items[$sku]['row'][7], 'reference' => 'SRQ-'.$this->today->format('W').'-'.substr($sku, 3)]);
                $stock->postMovement($m);
            }
        }

        auth()->logout();
    }

    // ------------------------------------------------------------------ Library

    private function library(): void
    {
        $subjects = ['Mathematics' => 'Basic Mathematics', 'English' => 'English Language', 'Kiswahili' => 'Kiswahili', 'Biology' => 'Biology', 'Chemistry' => 'Chemistry', 'Physics' => 'Physics', 'Geography' => 'Geography', 'History' => 'History', 'Civics' => 'Civics', 'Commerce' => 'Commerce'];
        $forms = ['One', 'Two', 'Three', 'Four'];
        $books = [];
        $isbn = 9789976000000;
        $shelfMap = ['Mathematics' => 'A', 'English' => 'B', 'Kiswahili' => 'B', 'Biology' => 'C', 'Chemistry' => 'C', 'Physics' => 'C', 'Geography' => 'D', 'History' => 'D', 'Civics' => 'D', 'Commerce' => 'E'];
        foreach ($subjects as $key => $subject) {
            foreach ($forms as $fi => $form) {
                $books[] = [
                    'title' => "{$subject} for Secondary Schools — Form {$form}", 'author' => 'Tanzania Institute of Education', 'publisher' => 'TIE',
                    'category' => 'Textbook', 'shelf' => $shelfMap[$key].($fi + 1), 'copies_total' => mt_rand(6, 15), 'isbn' => (string) ($isbn += 137),
                ];
            }
        }

        $literature = [
            ['Things Fall Apart', 'Chinua Achebe', 'Heinemann', 'Literature'], ['Weep Not, Child', 'Ngũgĩ wa Thiong\'o', 'Heinemann', 'Literature'], ['The River Between', 'Ngũgĩ wa Thiong\'o', 'Heinemann', 'Literature'],
            ['A Grain of Wheat', 'Ngũgĩ wa Thiong\'o', 'Heinemann', 'Literature'], ['No Longer at Ease', 'Chinua Achebe', 'Heinemann', 'Literature'], ['Arrow of God', 'Chinua Achebe', 'Heinemann', 'Literature'],
            ['The Lion and the Jewel', 'Wole Soyinka', 'Oxford University Press', 'Literature'], ['The Concubine', 'Elechi Amadi', 'Heinemann', 'Literature'], ['Houseboy', 'Ferdinand Oyono', 'Heinemann', 'Literature'],
            ['Unanswered Cries', 'Osman Conteh', 'Macmillan', 'Literature'], ['Passed Like a Shadow', 'Bernard Mapalala', 'DUP', 'Literature'], ['Spared', 'S. N. Ndunguru', 'Mkuki na Nyota', 'Literature'],
            ['Mabala the Farmer', 'Richard S. Mabala', 'Ben & Company', 'Literature'], ['The Interview', 'Patrick Ngugi', 'Macmillan', 'Literature'], ['Three Suitors: One Husband', 'Guillaume Oyono-Mbia', 'Methuen', 'Literature'],
            ['Betrayal in the City', 'Francis Imbuga', 'EAEP', 'Literature'], ['Song of Lawino', 'Okot p\'Bitek', 'EAEP', 'Literature'], ['Animal Farm', 'George Orwell', 'Penguin', 'Literature'],
            ['Half of a Yellow Sun', 'Chimamanda Ngozi Adichie', 'Fourth Estate', 'Literature'], ['Purple Hibiscus', 'Chimamanda Ngozi Adichie', 'Fourth Estate', 'Literature'], ['Paradise', 'Abdulrazak Gurnah', 'Bloomsbury', 'Literature'],
            ['By the Sea', 'Abdulrazak Gurnah', 'Bloomsbury', 'Literature'], ['Afterlives', 'Abdulrazak Gurnah', 'Bloomsbury', 'Literature'], ['Long Walk to Freedom', 'Nelson Mandela', 'Little, Brown', 'General'],
            ['Kinjeketile', 'Ebrahim Hussein', 'Oxford University Press', 'Kiswahili Literature'], ['Kilio Chetu', 'Medical Aid Foundation', 'TPH', 'Kiswahili Literature'], ['Orodha', 'Steve Reynolds', 'Macmillan Aidan', 'Kiswahili Literature'],
            ['Takadini', 'Ben J. Hanson', 'Mkuki na Nyota', 'Kiswahili Literature'], ['Watoto wa Mama N\'tilie', 'Emmanuel Mbogo', 'Heko Publishers', 'Kiswahili Literature'], ['Joka la Mdimu', 'A. J. Safari', 'Longhorn', 'Kiswahili Literature'],
            ['Mapenzi Bora', 'Shaaban Robert', 'Mkuki na Nyota', 'Kiswahili Literature'], ['Kusadikika', 'Shaaban Robert', 'Mkuki na Nyota', 'Kiswahili Literature'], ['Adili na Nduguze', 'Shaaban Robert', 'Mkuki na Nyota', 'Kiswahili Literature'],
            ['Rosa Mistika', 'Euphrase Kezilahabi', 'EAEP', 'Kiswahili Literature'], ['Kiu', 'Mohamed Suleiman Mohamed', 'EAEP', 'Kiswahili Literature'], ['Nyota ya Rehema', 'Mohammed S. Mohammed', 'Oxford University Press', 'Kiswahili Literature'],
            ['Wasakatonge', 'Mohammed S. Khatib', 'Oxford University Press', 'Kiswahili Literature'], ['Fungate ya Uhuru', 'Mohammed S. Mohammed', 'Oxford University Press', 'Kiswahili Literature'], ['Mashairi ya Saadani', 'Saadani Kandoro', 'TPH', 'Kiswahili Literature'],
            ['Oxford Advanced Learner\'s Dictionary', 'A. S. Hornby', 'Oxford University Press', 'Reference'], ['Kamusi ya Kiswahili Sanifu', 'TUKI', 'Oxford University Press', 'Reference'], ['Philip\'s Secondary School Atlas', 'Philip\'s', 'Philip\'s', 'Reference'],
            ['Collins English Dictionary', 'Collins', 'HarperCollins', 'Reference'], ['Encyclopaedia of Science', 'DK', 'Dorling Kindersley', 'Reference'], ['Tanzania: A History', 'Isaria Kimambo', 'E&D Vision', 'History'],
            ['A History of Tanzania', 'I. N. Kimambo & A. J. Temu', 'EAPH', 'History'], ['Freedom and Unity', 'Julius K. Nyerere', 'Oxford University Press', 'History'], ['Ujamaa: Essays on Socialism', 'Julius K. Nyerere', 'Oxford University Press', 'History'],
            ['How Europe Underdeveloped Africa', 'Walter Rodney', 'TPH', 'History'], ['Advanced Level Physics', 'Nelkon & Parker', 'Heinemann', 'Science'], ['Chemistry: A Modern Course', 'R. C. Smoot', 'Merrill', 'Science'],
            ['Biology: A Functional Approach', 'M. B. V. Roberts', 'Nelson', 'Science'], ['Secondary Physics Practical Guide', 'Longhorn', 'Longhorn', 'Science'], ['Principles of Accounts', 'Frank Wood', 'Pearson', 'General'],
            ['Holy Bible (Good News)', 'Bible Society of Tanzania', 'BST', 'Religion'], ['The Holy Qur\'an (English translation)', 'Yusuf Ali', 'Islamic Foundation', 'Religion'], ['Bible Knowledge for Secondary Schools', 'TIE', 'TIE', 'Religion'],
            ['Islamic Knowledge Form Three & Four', 'TIE', 'TIE', 'Religion'], ['NECTA CSEE Past Papers — Mathematics', 'Exam Prep TZ', 'Nyambari Nyangwine', 'Revision'], ['NECTA CSEE Past Papers — Biology', 'Exam Prep TZ', 'Nyambari Nyangwine', 'Revision'],
            ['NECTA CSEE Past Papers — Chemistry', 'Exam Prep TZ', 'Nyambari Nyangwine', 'Revision'], ['NECTA CSEE Past Papers — Physics', 'Exam Prep TZ', 'Nyambari Nyangwine', 'Revision'], ['NECTA FTNA Revision — All Subjects', 'Exam Prep TZ', 'Nyambari Nyangwine', 'Revision'],
            ['English Grammar in Use', 'Raymond Murphy', 'Cambridge University Press', 'Reference'], ['Sarufi na Matumizi ya Kiswahili', 'S. A. K. Mlacha', 'TUKI', 'Kiswahili Literature'], ['Gifted Hands', 'Ben Carson', 'Zondervan', 'General'],
            ['Rich Dad Poor Dad', 'Robert Kiyosaki', 'Plata Publishing', 'General'], ['The Alchemist', 'Paulo Coelho', 'HarperCollins', 'General'], ['Diary of a Wimpy Kid', 'Jeff Kinney', 'Puffin', 'General'],
            ['Harry Potter and the Philosopher\'s Stone', 'J. K. Rowling', 'Bloomsbury', 'General'], ['Matilda', 'Roald Dahl', 'Puffin', 'General'], ['Gulliver\'s Travels', 'Jonathan Swift', 'Penguin', 'Literature'],
            ['Romeo and Juliet', 'William Shakespeare', 'Penguin', 'Literature'], ['Macbeth', 'William Shakespeare', 'Penguin', 'Literature'], ['The Old Man and the Sea', 'Ernest Hemingway', 'Scribner', 'Literature'],
            ['Kilimanjaro: The Roof of Africa', 'Harry Kilimo', 'Mkuki na Nyota', 'General'], ['Wildlife of Tanzania', 'Tim Davenport', 'Bradt', 'General'], ['Computer Studies for Secondary Schools', 'TIE', 'TIE', 'Textbook'],
            ['Book-keeping for Secondary Schools', 'TIE', 'TIE', 'Textbook'],
        ];
        foreach ($literature as $i => [$title, $author, $publisher, $category]) {
            $shelf = ['Literature' => 'L', 'Kiswahili Literature' => 'K', 'Reference' => 'R', 'History' => 'H', 'Science' => 'S', 'Religion' => 'RL', 'Revision' => 'RV', 'General' => 'G', 'Textbook' => 'E'][$category] ?? 'G';
            $books[] = [
                'title' => $title, 'author' => $author, 'publisher' => $publisher, 'category' => $category,
                'shelf' => $shelf.(($i % 6) + 1), 'copies_total' => $category === 'Reference' ? mt_rand(1, 3) : mt_rand(2, 8), 'isbn' => (string) ($isbn += 211),
            ];
        }

        $models = collect($books)->map(fn ($b) => Book::create($b + ['copies_available' => $b['copies_total']]));

        // Loans history + current loans (respecting max 3 open per borrower and available copies)
        $students = Student::where('status', 'active')->inRandomOrder()->limit(90)->pluck('id')->values();
        $staff = Employee::where('status', 'active')->where('category', 'teaching')->pluck('id')->values();
        $open = [];
        $issuedCount = [];

        $makeLoan = function (Book $book, ?int $studentId, ?int $employeeId, CarbonImmutable $issued, string $status, ?CarbonImmutable $returned = null) use (&$open, &$issuedCount): void {
            $due = $issued->addDays(BookLoan::LOAN_DAYS);
            $fine = '0.00';
            if ($status !== 'issued') {
                $late = $returned ? max(0, (int) $due->diffInDays($returned, false)) : 0;
                $fine = $status === 'lost' ? '25000.00' : bcmul((string) $late, BookLoan::FINE_PER_DAY, 2);
            }
            BookLoan::create([
                'book_id' => $book->id, 'student_id' => $studentId, 'employee_id' => $employeeId,
                'issued_on' => $issued->toDateString(), 'due_on' => $due->toDateString(),
                'returned_on' => $returned?->toDateString(), 'fine' => $fine, 'status' => $status, 'issued_by' => $this->users['library'],
            ]);
            if ($status === 'issued') {
                $issuedCount[$book->id] = ($issuedCount[$book->id] ?? 0) + 1;
                $key = $studentId ? "s{$studentId}" : "e{$employeeId}";
                $open[$key] = ($open[$key] ?? 0) + 1;
            }
        };

        // Returned history (some late with fines)
        foreach (range(1, 55) as $i) {
            $book = $models[mt_rand(0, $models->count() - 1)];
            $issued = $this->today->subDays(mt_rand(20, 150));
            $returned = $issued->addDays(mt_rand(5, 20));
            if ($returned->gte($this->today)) {
                $returned = $this->today->subDay();
            }
            $isStaff = $i % 9 === 0 && $staff->isNotEmpty();
            $makeLoan($book, $isStaff ? null : $students[$i % $students->count()], $isStaff ? $staff[$i % $staff->count()] : null, $issued, 'returned', $returned);
        }

        // Current loans: ~18 on time, ~7 overdue
        $candidates = $models->filter(fn ($b) => $b->copies_total >= 2)->values();
        foreach (range(1, 25) as $i) {
            $book = $candidates[mt_rand(0, $candidates->count() - 1)];
            if (($issuedCount[$book->id] ?? 0) >= $book->copies_total) {
                continue;
            }
            $isStaff = $i % 8 === 0 && $staff->isNotEmpty();
            $studentId = $isStaff ? null : $students[($i * 3) % $students->count()];
            $employeeId = $isStaff ? $staff[$i % $staff->count()] : null;
            $key = $studentId ? "s{$studentId}" : "e{$employeeId}";
            if (($open[$key] ?? 0) >= BookLoan::MAX_OPEN_LOANS) {
                continue;
            }
            $issued = $i <= 7 ? $this->today->subDays(mt_rand(17, 35)) : $this->today->subDays(mt_rand(0, 12));
            $makeLoan($book, $studentId, $employeeId, $issued, 'issued');
        }

        // Two lost books (copy removed from collection)
        foreach ($candidates->shuffle()->take(2) as $j => $book) {
            $makeLoan($book, $students[50 + $j] ?? $students[0], null, $this->today->subDays(70 + $j * 10), 'lost', $this->today->subDays(40));
            $book->forceFill(['copies_total' => max(1, $book->copies_total - 1)])->save();
        }

        $models->each(fn (Book $b) => $b->syncAvailability());
    }

    // ------------------------------------------------------------------ Health

    private function health(): void
    {
        $nurse = $this->users['boarding'];
        $cases = [
            ['Fever, headache and joint pains', 'mRDT positive for malaria. Given ALu (Artemether-Lumefantrine) first dose, paracetamol 1g, plenty of fluids. Admitted to sick bay.', null],
            ['Fever and chills', 'mRDT negative. Paracetamol, observation in sick bay for 4 hours. Temperature normalised.', null],
            ['Stomach ache after lunch', 'Antacid given, rested 1 hour. Returned to class.', null],
            ['Diarrhoea and vomiting', 'ORS, kept under observation. Persistent symptoms.', 'Mwananyamala Regional Hospital'],
            ['Sprained ankle during football', 'RICE: ice pack, compression bandage, elevation. Excused from games for one week.', null],
            ['Cut on palm (lab glassware)', 'Wound cleaned with saline, dressed with sterile gauze. Tetanus status verified.', null],
            ['Common cold and sore throat', 'Warm fluids, paracetamol, advised rest.', null],
            ['Toothache', 'Paracetamol for pain. Dental review recommended.', 'Mbezi Health Centre (Dental)'],
            ['Menstrual cramps', 'Ibuprofen 400mg, hot water bottle, rested in sick bay.', null],
            ['Skin rash on arms', 'Calamine lotion applied. Possible reaction to new soap; advised to change.', null],
            ['Eye irritation and redness', 'Eyes irrigated with clean water. Chloramphenicol eye drops.', null],
            ['Asthma attack during morning run', 'Salbutamol inhaler (own), seated upright, breathing settled after 15 minutes.', null],
            ['Severe abdominal pain, right side', 'Pain not relieved, tenderness in lower right abdomen. Guardian called; taken by school vehicle.', 'Aga Khan Hospital'],
            ['Headache', 'Paracetamol, water, rested 30 minutes.', null],
            ['Nose bleeding', 'Pinched nose, head forward, cold compress. Stopped within 10 minutes.', null],
        ];

        $students = Student::where('status', 'active')->inRandomOrder()->limit(25)->get(['id']);
        foreach ($students as $i => $student) {
            [$complaint, $treatment, $referral] = $cases[$i % count($cases)];
            $daysAgo = $i < 2 ? 0 : mt_rand(1, 60);
            $visit = $this->today->subDays($daysAgo)->setTime(mt_rand(7, 20), [0, 10, 20, 30, 40, 50][mt_rand(0, 5)]);
            if ($visit->gt(now())) {
                $visit = now()->toImmutable()->subHour();
            }
            HealthVisit::create([
                'student_id' => $student->id,
                'visited_at' => $visit,
                'complaint' => $complaint,
                'treatment' => $treatment,
                'referred_to' => $referral,
                'guardian_notified' => $referral !== null || mt_rand(1, 100) <= 55,
                'recorded_by' => $nurse,
            ]);
        }
    }
}
