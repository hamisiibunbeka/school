<?php

namespace App\Imports;

use App\Models\Department;
use App\Models\Employee;
use App\Services\DocumentNumber;
use Illuminate\Support\Str;

class EmployeeImporter extends Importer
{
    private array $departments = [];

    private array $existing = [];

    public static function key(): string
    {
        return 'employees';
    }

    public function title(): string
    {
        return 'Employees';
    }

    public function permission(): string
    {
        return 'hr.manage';
    }

    public function notes(): ?string
    {
        return 'Departments are matched by name (create them first or import departments). Employee numbers are generated when blank.';
    }

    public function columns(): array
    {
        return [
            ['key' => 'employee_no', 'label' => 'Employee No', 'example' => 'EMP-0101', 'help' => 'Leave blank to auto-number.', 'aliases' => ['staff no', 'check no']],
            ['key' => 'first_name', 'label' => 'First Name', 'required' => true, 'example' => 'Neema'],
            ['key' => 'last_name', 'label' => 'Last Name', 'required' => true, 'example' => 'Temba', 'aliases' => ['surname']],
            ['key' => 'gender', 'label' => 'Gender', 'example' => 'female', 'options' => ['male', 'female']],
            ['key' => 'date_of_birth', 'label' => 'Date of Birth', 'example' => '21/06/1990', 'help' => 'dd/mm/yyyy', 'aliases' => ['dob']],
            ['key' => 'phone', 'label' => 'Phone', 'example' => '+255713000222'],
            ['key' => 'email', 'label' => 'Email', 'example' => 'neema.temba@school.ac.tz'],
            ['key' => 'national_id', 'label' => 'National ID (NIDA)', 'example' => '19900621-12345-00001-21', 'aliases' => ['nida', 'national id']],
            ['key' => 'department', 'label' => 'Department', 'example' => 'Sciences'],
            ['key' => 'designation', 'label' => 'Designation', 'example' => 'Biology Teacher', 'aliases' => ['job title', 'position']],
            ['key' => 'category', 'label' => 'Category', 'example' => 'teaching', 'options' => ['teaching', 'non_teaching'], 'help' => 'teaching / non_teaching'],
            ['key' => 'employment_type', 'label' => 'Employment Type', 'example' => 'permanent', 'options' => ['permanent', 'contract', 'part_time']],
            ['key' => 'hire_date', 'label' => 'Hire Date', 'example' => '01/02/2024', 'help' => 'dd/mm/yyyy'],
            ['key' => 'contract_end_date', 'label' => 'Contract End Date', 'example' => '', 'help' => 'dd/mm/yyyy (contract staff)'],
            ['key' => 'basic_salary', 'label' => 'Basic Salary', 'example' => '1200000', 'help' => 'Monthly, numbers only'],
            ['key' => 'bank_name', 'label' => 'Bank Name', 'example' => 'CRDB Bank'],
            ['key' => 'bank_account', 'label' => 'Bank Account', 'example' => '0150123456789'],
            ['key' => 'nssf_no', 'label' => 'NSSF No', 'example' => 'NSSF123456'],
            ['key' => 'tin', 'label' => 'TIN', 'example' => '123-456-789'],
            ['key' => 'qualification', 'label' => 'Qualification', 'example' => 'B.Ed'],
            ['key' => 'address', 'label' => 'Address', 'example' => 'Kimara, Dar es Salaam'],
        ];
    }

    protected function prepare(): void
    {
        $this->departments = $this->lookup(Department::all());
        foreach (Employee::all(['id', 'employee_no', 'email', 'national_id']) as $e) {
            foreach (['employee_no', 'email', 'national_id'] as $f) {
                if (filled($e->{$f})) {
                    $this->existing[$f][Str::lower($e->{$f})] = true;
                }
            }
        }
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['first_name', 'last_name'], $errors);

        $departmentId = null;
        if (filled($row['department'] ?? '')) {
            $departmentId = $this->departments[Str::lower($row['department'])] ?? null;
            if (! $departmentId) {
                $errors[] = "Department \"{$row['department']}\" does not exist.";
            }
        }
        if (filled($row['email'] ?? '') && ! filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Email is not valid.';
        }

        $data = [
            'employee_no' => ($row['employee_no'] ?? '') ?: null,
            'first_name' => Str::title($row['first_name'] ?? ''),
            'last_name' => Str::title($row['last_name'] ?? ''),
            'gender' => $this->enum($row['gender'] ?? '', ['male', 'female'], 'Gender', $errors, null, ['m' => 'male', 'f' => 'female', 'me' => 'male', 'ke' => 'female']),
            'date_of_birth' => $this->date($row['date_of_birth'] ?? '', 'Date of birth', $errors, true),
            'phone' => ($row['phone'] ?? '') ?: null,
            'email' => ($row['email'] ?? '') ? Str::lower($row['email']) : null,
            'national_id' => ($row['national_id'] ?? '') ?: null,
            'department_id' => $departmentId,
            'designation' => ($row['designation'] ?? '') ?: null,
            'category' => $this->enum($row['category'] ?? '', ['teaching', 'non_teaching'], 'Category', $errors, 'teaching', ['non-teaching' => 'non_teaching', 'non teaching' => 'non_teaching', 'support' => 'non_teaching']),
            'employment_type' => $this->enum($row['employment_type'] ?? '', ['permanent', 'contract', 'part_time'], 'Employment type', $errors, 'permanent', ['part-time' => 'part_time', 'part time' => 'part_time']),
            'hire_date' => $this->date($row['hire_date'] ?? '', 'Hire date', $errors),
            'contract_end_date' => $this->date($row['contract_end_date'] ?? '', 'Contract end date', $errors),
            'basic_salary' => $this->number($row['basic_salary'] ?? '', 'Basic salary', $errors) ?? 0,
            'bank_name' => ($row['bank_name'] ?? '') ?: null,
            'bank_account' => ($row['bank_account'] ?? '') ?: null,
            'nssf_no' => ($row['nssf_no'] ?? '') ?: null,
            'tin' => ($row['tin'] ?? '') ?: null,
            'qualification' => ($row['qualification'] ?? '') ?: null,
            'address' => ($row['address'] ?? '') ?: null,
        ];

        $duplicate = null;
        foreach (['employee_no' => 'Employee no.', 'email' => 'Email', 'national_id' => 'National ID'] as $f => $label) {
            $v = $data[$f];
            if ($v && isset($this->existing[$f][Str::lower($v)])) {
                $duplicate = "{$label} {$v} already belongs to an employee.";
                break;
            }
            if ($v && $this->seenBefore($f, $v)) {
                $duplicate = "{$label} {$v} appears more than once in this file.";
                break;
            }
        }

        return [$errors, $data, $duplicate];
    }

    protected function persist(array $data): void
    {
        unset($data['__duplicate']);
        $employee = new Employee(collect($data)->except('employee_no')->all());
        $employee->employee_no = $data['employee_no'] ?: DocumentNumber::next('employee');
        $employee->status = 'active';
        $employee->save();
    }
}
