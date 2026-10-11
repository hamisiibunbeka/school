import { Head } from '@inertiajs/react';

/** Sets the browser tab title only (use PageHeader on app pages). */
export default function PageTitle({ title }: { title: string }) {
    return <Head title={title} />;
}
