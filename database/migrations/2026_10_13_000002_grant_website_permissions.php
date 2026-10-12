<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Give existing system roles the new "website" (CMS) permissions. */
return new class extends Migration
{
    private array $grants = [
        'school-admin' => ['website.view', 'website.manage'],
        'principal' => ['website.view', 'website.manage'],
        'admissions-officer' => ['website.view'],
    ];

    public function up(): void
    {
        foreach (DB::table('roles')->whereIn('slug', array_keys($this->grants))->get(['id', 'slug', 'permissions']) as $role) {
            $permissions = json_decode($role->permissions ?? '[]', true) ?: [];
            $merged = array_values(array_unique([...$permissions, ...$this->grants[$role->slug]]));
            DB::table('roles')->where('id', $role->id)->update(['permissions' => json_encode($merged)]);
        }
    }

    public function down(): void
    {
        foreach (DB::table('roles')->get(['id', 'permissions']) as $role) {
            $permissions = array_values(array_filter(json_decode($role->permissions ?? '[]', true) ?: [], fn ($p) => ! str_starts_with($p, 'website.')));
            DB::table('roles')->where('id', $role->id)->update(['permissions' => json_encode($permissions)]);
        }
    }
};
