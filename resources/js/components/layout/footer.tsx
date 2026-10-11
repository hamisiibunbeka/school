import { usePage } from '@inertiajs/react';

export default function Footer() {
    const { name, school } = usePage().props;
    return (
        <footer className="no-print mt-auto p-6 pt-0 text-center text-white-dark sm:text-start">
            © {new Date().getFullYear()} {school?.name ?? name}. All rights reserved.
            <span className="float-none ms-1 sm:float-end">Powered by {name} School Management</span>
        </footer>
    );
}
