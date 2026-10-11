import type { SharedProps } from '@/types';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: SharedProps & { [key: string]: unknown };
        flashDataType: {
            toast?: { type: 'success' | 'error' | 'info' | 'warning'; message: string };
        };
    }
}
