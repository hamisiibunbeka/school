<?php

namespace Database\Seeders;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Seeder;

/** SaaS plans and the platform super administrator. */
class PlatformSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            ['Free Trial', 'trial', 0, 'monthly', 100, 10, 1, 50],
            ['Starter', 'starter', 600000, 'yearly', 300, 25, 1, 2000],
            ['Professional', 'professional', 1500000, 'yearly', 1000, 80, 2, 10000],
            ['Enterprise', 'enterprise', 3500000, 'yearly', null, null, 10, 50000],
        ];

        foreach ($plans as [$name, $code, $price, $interval, $students, $users, $schools, $sms]) {
            Plan::updateOrCreate(['code' => $code], [
                'name' => $name,
                'price' => $price,
                'billing_interval' => $interval,
                'max_students' => $students,
                'max_users' => $users,
                'max_schools' => $schools,
                'sms_credits' => $sms,
                'modules' => array_keys(config('permissions.modules')),
                'is_active' => true,
            ]);
        }

        $admin = User::firstOrNew(['email' => 'superadmin@mzenzi.test']);
        $admin->forceFill([
            'name' => 'Platform Administrator',
            'password' => 'password',
            'is_super_admin' => true,
            'email_verified_at' => now(),
            'status' => 'active',
        ])->save();
    }
}
