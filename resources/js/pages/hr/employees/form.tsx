import { Link, useForm, usePage } from '@inertiajs/react';
import { LoaderCircle, Save } from 'lucide-react';
import type { FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import { FormGrid, FormSection, Input, Select } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { money } from '@/lib/utils';
import type { Option } from '@/types';
import DobAgeField from '@/components/ui/dob-age-field';

type EmployeeData = {
    id: number;
    employee_no: string;
    full_name: string;
    first_name: string;
    last_name: string;
    gender: string | null;
    date_of_birth: string | null;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    address: string | null;
    emergency_contact: string | null;
    designation: string | null;
    department_id: number | null;
    category: string;
    employment_type: string;
    qualification: string | null;
    hire_date: string | null;
    contract_end_date: string | null;
    basic_salary: string;
    bank_name: string | null;
    bank_account: string | null;
    nssf_no: string | null;
    tin: string | null;
};

type Props = {
    employee: EmployeeData | null;
    departments: Option[];
    categories: Option[];
    types: Option[];
    designations: string[];
    banks: string[];
};

export default function EmployeeForm({ employee, departments, categories, types, designations, banks }: Props) {
    const editing = !!employee;
    const { school } = usePage().props;
    const form = useForm({
        employee_no: employee?.employee_no ?? '',
        first_name: employee?.first_name ?? '',
        last_name: employee?.last_name ?? '',
        gender: employee?.gender ?? '',
        date_of_birth: employee?.date_of_birth ?? '',
        phone: employee?.phone ?? '',
        email: employee?.email ?? '',
        national_id: employee?.national_id ?? '',
        address: employee?.address ?? '',
        emergency_contact: employee?.emergency_contact ?? '',
        designation: employee?.designation ?? '',
        department_id: employee?.department_id ? String(employee.department_id) : '',
        category: employee?.category ?? 'teaching',
        employment_type: employee?.employment_type ?? 'permanent',
        qualification: employee?.qualification ?? '',
        hire_date: employee?.hire_date ?? new Date().toISOString().slice(0, 10),
        contract_end_date: employee?.contract_end_date ?? '',
        basic_salary: employee ? String(Number(employee.basic_salary)) : '',
        bank_name: employee?.bank_name ?? '',
        bank_account: employee?.bank_account ?? '',
        nssf_no: employee?.nssf_no ?? '',
        tin: employee?.tin ?? '',
    });
    const err = form.errors as Record<string, string>;
    const set = (key: keyof typeof form.data) => (e: { target: { value: string } }) => form.setData(key, e.target.value);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (editing) form.put(`/hr/employees/${employee.id}`, { preserveScroll: true });
        else form.post('/hr/employees', { preserveScroll: true });
    };

    const name = `${form.data.first_name} ${form.data.last_name}`.trim();

    return (
        <>
            <PageHeader
                title={editing ? `Edit ${employee.full_name}` : 'Add Employee'}
                subtitle={editing ? `Employee no. ${employee.employee_no}` : 'Capture personal details, employment terms, salary and statutory numbers.'}
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Employees', href: '/hr/employees' }, { title: editing ? 'Edit' : 'New employee' }]}
            />

            <form onSubmit={submit} className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <div className="panel h-max xl:sticky xl:top-24">
                    <div className="flex flex-col items-center text-center">
                        <Avatar name={name || 'New employee'} className="h-28 w-28 text-3xl" />
                        <div className="mt-3 text-lg font-bold">{name || 'New employee'}</div>
                        <div className="text-sm text-white-dark">{form.data.designation || 'Position'}</div>
                        <div className="mt-5 w-full text-start">
                            <Input
                                label="Employee number"
                                name="employee_no"
                                value={form.data.employee_no}
                                onChange={set('employee_no')}
                                error={err.employee_no}
                                placeholder="Auto-generated if blank"
                            />
                        </div>
                        {form.data.basic_salary && (
                            <div className="mt-4 w-full rounded-lg bg-primary-light p-3 dark:bg-primary-dark-light">
                                <div className="text-[11px] font-bold text-white-dark uppercase">Monthly basic</div>
                                <div className="text-lg font-extrabold text-primary">{money(form.data.basic_salary, school?.currency ?? 'TZS')}</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="panel space-y-6 xl:col-span-3">
                    <FormSection title="Personal details" description="Legal names and identification as on the national ID.">
                        <FormGrid cols={3}>
                            <Input label="First name" name="first_name" required value={form.data.first_name} onChange={set('first_name')} error={err.first_name} />
                            <Input label="Last name" name="last_name" required value={form.data.last_name} onChange={set('last_name')} error={err.last_name} />
                            <Select
                                label="Gender"
                                name="gender"
                                required
                                placeholder="Select…"
                                value={form.data.gender}
                                onChange={set('gender')}
                                options={[
                                    { value: 'male', label: 'Male' },
                                    { value: 'female', label: 'Female' },
                                ]}
                                error={err.gender}
                            />
                            <DobAgeField value={form.data.date_of_birth} onChange={(v) => form.setData('date_of_birth', v)} error={err.date_of_birth} minAge={16} maxAge={80} typicalAge={30} />
                            <Input label="National ID (NIDA)" name="national_id" value={form.data.national_id} onChange={set('national_id')} error={err.national_id} />
                            <Input label="Qualification" name="qualification" value={form.data.qualification} onChange={set('qualification')} placeholder="e.g. B.Ed Science" />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Contact" description="Used for payslips, notices and emergencies.">
                        <FormGrid cols={3}>
                            <Input label="Phone" name="phone" value={form.data.phone} onChange={set('phone')} error={err.phone} placeholder="+255…" />
                            <Input label="Email" type="email" name="email" value={form.data.email} onChange={set('email')} error={err.email} />
                            <Input label="Emergency contact" name="emergency_contact" value={form.data.emergency_contact} onChange={set('emergency_contact')} placeholder="Name · phone" />
                            <Input label="Address" name="address" value={form.data.address} onChange={set('address')} wrapperClassName="sm:col-span-2 lg:col-span-3" />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Employment" description="Position, department and contract terms.">
                        <FormGrid cols={3}>
                            <div>
                                <Input label="Designation" name="designation" required list="designations" value={form.data.designation} onChange={set('designation')} error={err.designation} placeholder="e.g. Physics Teacher" />
                                <datalist id="designations">
                                    {designations.map((d) => (
                                        <option key={d} value={d} />
                                    ))}
                                </datalist>
                            </div>
                            <Select label="Department" name="department_id" placeholder="— None —" value={form.data.department_id} onChange={set('department_id')} options={departments} error={err.department_id} />
                            <Select label="Category" name="category" required value={form.data.category} onChange={set('category')} options={categories} error={err.category} />
                            <Select label="Employment type" name="employment_type" required value={form.data.employment_type} onChange={set('employment_type')} options={types} error={err.employment_type} />
                            <Input label="Hire date" type="date" name="hire_date" value={form.data.hire_date} onChange={set('hire_date')} error={err.hire_date} />
                            <Input
                                label="Contract end date"
                                type="date"
                                name="contract_end_date"
                                required={form.data.employment_type === 'contract'}
                                value={form.data.contract_end_date}
                                onChange={set('contract_end_date')}
                                error={err.contract_end_date}
                                help={form.data.employment_type === 'contract' ? 'Required for contract staff' : 'Optional'}
                            />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Salary, bank & statutory" description="Confidential: visible only to HR managers and payroll staff. Allowances and deductions are configured under Payroll › Salary components.">
                        <FormGrid cols={3}>
                            <Input
                                label={`Basic salary (${school?.currency ?? 'TZS'} / month)`}
                                type="number"
                                min={0}
                                step="0.01"
                                name="basic_salary"
                                required
                                value={form.data.basic_salary}
                                onChange={set('basic_salary')}
                                error={err.basic_salary}
                            />
                            <div>
                                <Input label="Bank" name="bank_name" list="banks" value={form.data.bank_name} onChange={set('bank_name')} error={err.bank_name} />
                                <datalist id="banks">
                                    {banks.map((b) => (
                                        <option key={b} value={b} />
                                    ))}
                                </datalist>
                            </div>
                            <Input label="Bank account no." name="bank_account" value={form.data.bank_account} onChange={set('bank_account')} error={err.bank_account} />
                            <Input label="NSSF membership no." name="nssf_no" value={form.data.nssf_no} onChange={set('nssf_no')} error={err.nssf_no} />
                            <Input label="TIN" name="tin" value={form.data.tin} onChange={set('tin')} error={err.tin} placeholder="123-456-789" />
                        </FormGrid>
                    </FormSection>

                    <div className="flex items-center justify-center gap-3 pt-2">
                        <Link href={editing ? `/hr/employees/${employee.id}` : '/hr/employees'} className="btn btn-outline-dark">
                            Cancel
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={form.processing}>
                            {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {editing ? 'Save changes' : 'Add employee'}
                        </button>
                    </div>
                </div>
            </form>
        </>
    );
}
