import { createInertiaApp } from '@inertiajs/react';
import { initializeTheme } from '@/hooks/use-theme';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Mzenzi School';

void createInertiaApp({
    title: (title) => (title ? `${title} | ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name === 'error':
                return null;
            case name.startsWith('auth/'):
            case name === 'subscription-suspended':
                return AuthLayout;
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    progress: {
        color: '#4361ee',
        showSpinner: false,
    },
});

initializeTheme();
