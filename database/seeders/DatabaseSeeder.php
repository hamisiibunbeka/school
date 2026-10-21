<?php

namespace Database\Seeders;

use App\Models\School;
use App\Support\Tenancy;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the platform plus a fully populated demo school.
     *
     * Module seeders run inside the demo school's tenancy context and are
     * skipped automatically if a module has not been installed.
     */
    public function run(): void
    {
        $this->call(PlatformSeeder::class);
        $this->call(CoreDemoSeeder::class);

        $school = School::where('code', 'MZSS')->first();

        $moduleSeeders = [
            AcademicsDemoSeeder::class,
            AdmissionsDemoSeeder::class,
            AttendanceDemoSeeder::class,
            ExamsDemoSeeder::class,
            ALevelDemoSeeder::class,
            FeesDemoSeeder::class,
            AccountingDemoSeeder::class,
            HrDemoSeeder::class,
            OperationsDemoSeeder::class,
            DutiesDemoSeeder::class,
            CommunicationDemoSeeder::class,
            WebsiteDemoSeeder::class,
        ];

        app(Tenancy::class)->runAs($school, function () use ($moduleSeeders) {
            foreach ($moduleSeeders as $seeder) {
                if (class_exists($seeder)) {
                    $this->call($seeder);
                }
            }
        });

        // The tenant's second campus: Nursery + Standard I–VII with PSLE-style results (login primary@mzenzi.test).
        if ($primary = School::where('code', 'MZPS')->first()) {
            app(Tenancy::class)->runAs($primary, fn () => $this->call(PrimaryDemoSeeder::class));
        }
    }
}
