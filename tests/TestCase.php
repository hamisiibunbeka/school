<?php

namespace Tests;

use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\User;
use App\Services\SchoolProvisioner;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Provision a complete tenant (roles, school, admin, chart of accounts ...).
     *
     * @return array{school: School, admin: User}
     */
    protected function makeSchool(string $name = 'Test Secondary School', ?string $email = null): array
    {
        $result = app(SchoolProvisioner::class)->provision([
            'school_name' => $name,
            'admin_name' => 'Admin '.$name,
            'email' => $email ?? fake()->unique()->safeEmail(),
            'password' => 'password',
        ]);
        $result['tenant']->update(['status' => 'active']);

        return ['school' => $result['school'], 'admin' => $result['admin']];
    }

    /** Create a student inside the given school (tenancy context handled). */
    protected function makeStudent(School $school, array $attributes = []): Student
    {
        return app(Tenancy::class)->runAs($school, function () use ($attributes) {
            $class = SchoolClass::firstOrCreate(['name' => 'Form One'], ['level' => 1]);

            $student = new Student(array_merge([
                'first_name' => fake()->firstName(),
                'last_name' => fake()->lastName(),
                'gender' => 'female',
                'school_class_id' => $class->id,
                'residence_type' => 'day',
                'status' => 'active',
            ], $attributes));
            $student->admission_no = 'ADM-'.fake()->unique()->numberBetween(1000, 99999);
            $student->save();

            return $student;
        });
    }

    /** Create a user with one of the tenant's default roles. */
    protected function makeUserWithRole(School $school, string $roleSlug): User
    {
        $user = new User([
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password',
            'school_id' => $school->id,
            'role_id' => $school->tenant->roles()->where('slug', $roleSlug)->value('id'),
        ]);
        $user->tenant_id = $school->tenant_id;
        $user->save();

        return $user;
    }
}
