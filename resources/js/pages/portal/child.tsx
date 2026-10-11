import { Link } from '@inertiajs/react';
import { Users } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import WardDetail, { type Detail } from './_components/ward-detail';

type Props = { detail: Detail; siblings: { id: number; name: string }[]; term: { name: string } | null };

export default function PortalChild({ detail, siblings, term }: Props) {
    return (
        <>
            <PageHeader
                title={detail.student.full_name}
                subtitle={term ? `${term.name} overview` : undefined}
                breadcrumbs={[{ title: 'My Portal', href: '/portal' }, { title: detail.student.first_name }]}
                actions={
                    siblings.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Users className="h-4 w-4 text-white-dark" />
                            {siblings.map((s) => (
                                <Link key={s.id} href={`/portal/children/${s.id}`} className="btn btn-sm btn-outline-primary">
                                    {s.name}
                                </Link>
                            ))}
                        </div>
                    )
                }
            />
            <WardDetail detail={detail} />
        </>
    );
}
