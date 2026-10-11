import { Link } from '@inertiajs/react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsNav({ active }: { active: 'profile' | 'security' }) {
    const items = [
        { key: 'profile', label: 'Profile', href: '/settings/profile', icon: UserRound },
        { key: 'security', label: 'Password & Security', href: '/settings/security', icon: ShieldCheck },
    ];
    return (
        <div className="mb-5 flex overflow-x-auto border-b border-white-light dark:border-[#191e3a]">
            {items.map(({ key, label, href, icon: Icon }) => (
                <Link key={key} href={href} className={cn('tab-btn', active === key && 'active')}>
                    <Icon className="h-4 w-4" /> {label}
                </Link>
            ))}
        </div>
    );
}
