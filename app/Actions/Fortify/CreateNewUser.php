<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Models\User;
use App\Services\SchoolProvisioner;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\CreatesNewUsers;

/**
 * Public sign-up registers a new school (tenant) on a trial plan and
 * creates its first School Administrator.
 */
class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            'school_name' => ['required', 'string', 'max:150'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class)],
            'phone' => ['nullable', 'string', 'max:20'],
            'level' => ['nullable', Rule::in(['nursery', 'primary', 'secondary', 'combined'])],
            'residence_type' => ['nullable', Rule::in(['day', 'boarding', 'mixed'])],
            'password' => $this->passwordRules(),
        ])->validate();

        $result = app(SchoolProvisioner::class)->provision([
            'school_name' => $input['school_name'],
            'admin_name' => $input['name'],
            'email' => $input['email'],
            'password' => $input['password'],
            'phone' => $input['phone'] ?? null,
            'level' => $input['level'] ?? 'secondary',
            'residence_type' => $input['residence_type'] ?? 'mixed',
        ]);

        return $result['admin'];
    }
}
