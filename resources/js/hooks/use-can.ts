import { usePage } from '@inertiajs/react';

/**
 * Permission helper mirroring the server-side gate.
 * Usage: const can = useCan(); can('students.manage')
 * The server always re-checks; this only hides UI the user cannot use.
 */
export function useCan() {
    const { auth } = usePage().props;
    const permissions = auth.permissions ?? [];

    return (ability: string | string[]): boolean => {
        if (permissions.includes('*')) return true;
        const abilities = Array.isArray(ability) ? ability : [ability];
        return abilities.some((a) => permissions.includes(a));
    };
}
