import { Link } from '@inertiajs/react';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import { dateTime } from '@/lib/utils';

type Rider = { id: number; student: string; admission_no: string; class: string; guardian: string | null; guardian_phone: string | null };
type Stop = { id: number; name: string; sequence: number; pickup_time: string | null; dropoff_time: string | null; students: Rider[] };
type Props = {
    route: { id: number; name: string; description: string | null; vehicle: string | null; driver: string | null; driver_phone: string | null; capacity: number; assigned: number };
    stops: Stop[];
    noStop: Rider[];
    printedAt: string;
};

function RiderTable({ riders, offset }: { riders: Rider[]; offset: number }) {
    return (
        <div className="table-responsive">
            <table className="table table-compact">
                <thead>
                    <tr>
                        <th className="w-10">#</th>
                        <th>Student</th>
                        <th>Adm. No</th>
                        <th>Class</th>
                        <th>Guardian</th>
                        <th>Phone</th>
                        <th className="w-20 text-center!">AM ✓</th>
                        <th className="w-20 text-center!">PM ✓</th>
                    </tr>
                </thead>
                <tbody>
                    {riders.map((r, i) => (
                        <tr key={r.id}>
                            <td>{offset + i + 1}</td>
                            <td className="font-semibold">{r.student}</td>
                            <td>{r.admission_no}</td>
                            <td>{r.class}</td>
                            <td>{r.guardian ?? '—'}</td>
                            <td>{r.guardian_phone ?? '—'}</td>
                            <td className="text-center!">☐</td>
                            <td className="text-center!">☐</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function Manifest({ route, stops, noStop, printedAt }: Props) {
    let counter = 0;
    return (
        <>
            <PageHeader
                title={`Manifest — ${route.name}`}
                breadcrumbs={[{ title: 'Transport', href: '/transport/vehicles' }, { title: 'Routes', href: '/transport/routes' }, { title: 'Manifest' }]}
                actions={
                    <>
                        <Link href="/transport/routes" className="btn btn-outline-primary">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        <PrintButton label="Print manifest" />
                    </>
                }
            />
            <div className="panel">
                <Letterhead
                    title="Route Manifest"
                    meta={
                        <>
                            <div className="font-bold">{route.name}</div>
                            <div>Printed {dateTime(printedAt)}</div>
                        </>
                    }
                />
                <div className="mb-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                    <div>
                        <div className="text-xs text-white-dark uppercase">Vehicle</div>
                        <div className="font-semibold">{route.vehicle ?? '—'}</div>
                    </div>
                    <div>
                        <div className="text-xs text-white-dark uppercase">Driver</div>
                        <div className="font-semibold">
                            {route.driver ?? '—'} {route.driver_phone && <span className="text-white-dark">· {route.driver_phone}</span>}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-white-dark uppercase">Students</div>
                        <div className="font-semibold">
                            {route.assigned} / {route.capacity} seats
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-white-dark uppercase">Stops</div>
                        <div className="font-semibold">{stops.length}</div>
                    </div>
                </div>

                {stops.map((s) => {
                    const offset = counter;
                    counter += s.students.length;
                    return (
                        <div key={s.id} className="mb-6 break-inside-avoid">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white-light pb-1 dark:border-[#1b2e4b]">
                                <div className="flex items-center gap-2 font-bold text-primary">
                                    <MapPin className="h-4 w-4" /> Stop {s.sequence}: {s.name}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-white-dark">
                                    <Clock className="h-3.5 w-3.5" /> Pickup {s.pickup_time ?? '—'} · Drop-off {s.dropoff_time ?? '—'} · {s.students.length} student(s)
                                </div>
                            </div>
                            {s.students.length ? <RiderTable riders={s.students} offset={offset} /> : <p className="text-sm text-white-dark">No students at this stop.</p>}
                        </div>
                    );
                })}

                {noStop.length > 0 && (
                    <div className="mb-6">
                        <div className="mb-2 font-bold text-warning">Assigned without a stop</div>
                        <RiderTable riders={noStop} offset={counter} />
                    </div>
                )}

                <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
                    <div className="border-t border-dark pt-2">Driver signature</div>
                    <div className="border-t border-dark pt-2">Transport officer signature</div>
                </div>
            </div>
        </>
    );
}
