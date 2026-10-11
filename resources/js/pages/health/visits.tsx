import { useForm } from '@inertiajs/react';
import { Ambulance, BellOff, CalendarDays, Droplet, HeartPulse, LoaderCircle, Lock, Plus, ShieldAlert, Stethoscope } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { dateTime, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import SearchSelect from '../boarding/_components/search-select';

type Visit = {
    id: number;
    student_id: number;
    student: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    residence_type: string | null;
    visited_at: string;
    complaint: string;
    treatment: string | null;
    referred_to: string | null;
    guardian_notified: boolean;
    recorded_by: string | null;
};
type Profile = {
    id: number;
    full_name: string;
    admission_no: string;
    class: string;
    gender: string;
    date_of_birth: string | null;
    residence_type: string;
    blood_group: string | null;
    allergies: string | null;
    medical_notes: string | null;
    guardian: string | null;
    guardian_phone: string | null;
    visits_count: number;
    recent: { id: number; visited_at: string; complaint: string }[];
};
type Props = {
    visits: Paginated<Visit>;
    filters: { search: string; referred: string; from: string; to: string };
    students: Option[];
    topComplaints: { complaint: string; total: number }[];
    stats: { today: number; month: number; referrals: number; not_notified: number; allergies: number };
};

const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

const blank = { student_id: '', visited_at: nowLocal(), complaint: '', treatment: '', referred_to: '', guardian_notified: false };

function StudentHealthCard({ studentId }: { studentId: string }) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!studentId) {
            setProfile(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetch(`/health/students/${studentId}/profile`, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: Profile | null) => !cancelled && setProfile(data))
            .catch(() => !cancelled && setProfile(null))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [studentId]);

    if (!studentId) return null;
    if (loading)
        return (
            <div className="flex items-center gap-2 rounded-md border border-white-light p-3 text-sm text-white-dark dark:border-[#1b2e4b]">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading health profile…
            </div>
        );
    if (!profile) return null;

    return (
        <div className="rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold">
                    {profile.full_name} <span className="text-xs font-normal text-white-dark">· {profile.class} · {titleCase(profile.residence_type)}</span>
                </div>
                <span className="badge badge-soft-info">{profile.visits_count} previous visit(s)</span>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-danger" /> Blood group: <strong>{profile.blood_group ?? 'Unknown'}</strong>
                </div>
                <div className="sm:col-span-2">
                    {profile.allergies ? (
                        <span className="badge badge-soft-danger whitespace-normal">
                            <ShieldAlert className="me-1 inline h-3.5 w-3.5" /> Allergies: {profile.allergies}
                        </span>
                    ) : (
                        <span className="text-white-dark">No known allergies</span>
                    )}
                </div>
                {profile.medical_notes && <div className="text-xs text-white-dark sm:col-span-3">Medical notes: {profile.medical_notes}</div>}
                <div className="text-xs sm:col-span-3">
                    Guardian: <strong>{profile.guardian ?? '—'}</strong> {profile.guardian_phone && `· ${profile.guardian_phone}`}
                </div>
                {profile.recent.length > 0 && (
                    <div className="text-xs text-white-dark sm:col-span-3">
                        Recent: {profile.recent.map((r) => `${dateTime(r.visited_at)} — ${r.complaint}`).join(' · ')}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function Visits({ visits, filters: initial, students, topComplaints, stats }: Props) {
    const can = useCan();
    const manage = can('health.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Visit | null>(null);
    const form = useForm(blank);

    const openForm = (v: Visit | null) => {
        setEditing(v);
        form.clearErrors();
        form.setData(
            v
                ? { student_id: String(v.student_id), visited_at: v.visited_at, complaint: v.complaint, treatment: v.treatment ?? '', referred_to: v.referred_to ?? '', guardian_notified: v.guardian_notified }
                : { ...blank, visited_at: nowLocal() },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/health/visits/${editing.id}`, opts);
        else form.post('/health/visits', opts);
    };

    const columns: Column<Visit>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (v) => (
                <div className="flex items-center gap-3">
                    <Avatar name={v.student} src={v.photo_url} />
                    <div>
                        <div className="font-bold text-black dark:text-white-light">{v.student}</div>
                        <div className="text-xs text-white-dark">
                            {v.admission_no} · {v.class}
                        </div>
                    </div>
                </div>
            ),
        },
        { key: 'visited_at', header: 'Visited', render: (v) => <span className="whitespace-nowrap text-xs">{dateTime(v.visited_at)}</span> },
        { key: 'complaint', header: 'Complaint', render: (v) => <span className="font-semibold">{v.complaint}</span> },
        { key: 'treatment', header: 'Treatment / action', render: (v) => <span className="line-clamp-2 max-w-[260px] text-xs">{v.treatment ?? '—'}</span> },
        {
            key: 'referred_to',
            header: 'Referral',
            render: (v) => (v.referred_to ? <span className="badge badge-soft-danger whitespace-normal">{v.referred_to}</span> : <span className="text-white-dark">—</span>),
        },
        {
            key: 'guardian',
            header: 'Guardian',
            align: 'center',
            render: (v) => (v.guardian_notified ? <span className="badge badge-soft-success">Notified</span> : <span className="badge badge-soft-warning">Not yet</span>),
        },
        { key: 'actions', header: '', align: 'right', render: (v) => (manage ? <RowActions onEdit={() => openForm(v)} destroy={`/health/visits/${v.id}`} label="clinic visit" /> : null) },
    ];

    return (
        <>
            <PageHeader
                title="School Clinic"
                subtitle="Sick-bay visits, first aid, referrals and guardian notification."
                breadcrumbs={[{ title: 'Health & welfare' }, { title: 'Clinic visits' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Record visit
                        </button>
                    )
                }
            />

            <div className="no-print mb-5 flex items-center gap-2 rounded-md bg-dark-light p-3 text-xs text-dark dark:bg-dark-dark-light dark:text-white-dark">
                <Lock className="h-4 w-4 shrink-0" /> Confidential health information — visible only to staff with health permissions. Access and changes are audit-logged.
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Visits today" value={num(stats.today)} icon={Stethoscope} tone="primary" />
                <StatCard title="This month" value={num(stats.month)} icon={CalendarDays} tone="info" />
                <StatCard title="Referrals (month)" value={num(stats.referrals)} icon={Ambulance} tone={stats.referrals ? 'danger' : 'success'} />
                <StatCard title="Guardian not notified" value={num(stats.not_notified)} icon={BellOff} tone={stats.not_notified ? 'warning' : 'success'} hint={`Last 30 days · ${stats.allergies} students with allergies`} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <div className="panel xl:col-span-3">
                    <FilterBar
                        actions={
                            Object.values(filters).some(Boolean) && (
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                    Clear filters
                                </button>
                            )
                        }
                    >
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student or complaint…" />
                        <FilterSelect
                            value={filters.referred}
                            onChange={(v) => setFilter('referred', v)}
                            options={[
                                { value: 'yes', label: 'Referred' },
                                { value: 'no', label: 'Treated at school' },
                            ]}
                            placeholder="All outcomes"
                        />
                        <input type="date" className="form-input w-full sm:w-auto" title="From" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
                        <input type="date" className="form-input w-full sm:w-auto" title="To" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
                    </FilterBar>
                    <DataTable columns={columns} paginated={visits} empty="No clinic visits recorded" />
                </div>
                <div className="panel h-fit">
                    <h5 className="mb-1 flex items-center gap-2 text-lg font-semibold dark:text-white-light">
                        <HeartPulse className="h-5 w-5 text-danger" /> Common complaints
                    </h5>
                    <p className="mb-4 text-xs text-white-dark">Last 90 days</p>
                    {topComplaints.length === 0 ? (
                        <p className="text-sm text-white-dark">No visits yet.</p>
                    ) : (
                        <ul className="space-y-3">
                            {topComplaints.map((c) => (
                                <li key={c.complaint}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <button type="button" className="truncate text-start hover:text-primary" onClick={() => setFilter('search', c.complaint)}>
                                            {c.complaint}
                                        </button>
                                        <span className="font-bold">{c.total}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div className="h-full rounded-full bg-danger" style={{ width: `${(c.total / topComplaints[0].total) * 100}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit clinic visit' : 'Record clinic visit'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <SearchSelect label="Student" required options={students} value={form.data.student_id} onChange={(v) => form.setData('student_id', v)} error={form.errors.student_id} disabled={!!editing} />
                    <StudentHealthCard studentId={form.data.student_id} />
                    <FormGrid>
                        <Input label="Date & time" type="datetime-local" required value={form.data.visited_at} onChange={(e) => form.setData('visited_at', e.target.value)} error={form.errors.visited_at} />
                        <Input label="Complaint / symptoms" required value={form.data.complaint} onChange={(e) => form.setData('complaint', e.target.value)} error={form.errors.complaint} placeholder="e.g. Fever and headache" />
                    </FormGrid>
                    <Textarea label="Treatment / first aid given" value={form.data.treatment} onChange={(e) => form.setData('treatment', e.target.value)} error={form.errors.treatment} />
                    <Input label="Referred to (if any)" value={form.data.referred_to} onChange={(e) => form.setData('referred_to', e.target.value)} error={form.errors.referred_to} placeholder="e.g. Mwananyamala Regional Hospital" />
                    <Checkbox label="Guardian has been notified" checked={form.data.guardian_notified} onChange={(e) => form.setData('guardian_notified', e.target.checked)} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save visit
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
