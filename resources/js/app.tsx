import { createInertiaApp } from '@inertiajs/react';
import { registerPwa } from '@/hooks/use-pwa';
import { initializeTheme } from '@/hooks/use-theme';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Mzenzi School';

// Set when the current page is a public school website (which may be served at "/" too).
let isSitePage = false;

void createInertiaApp({
    // Public school websites own their titles (no platform suffix).
    title: (title) => (isSitePage ? title : title ? `${title} | ${appName}` : appName),
    layout: (name) => {
        isSitePage = name.startsWith('site/');
        switch (true) {
            case name === 'error':
            case name.startsWith('site/'): // public school websites render their own template layout
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
registerPwa();
