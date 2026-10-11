import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

type State = { theme: Theme; sidebarCollapsed: boolean; mobileSidebar: boolean };

const read = (key: string): string | null => {
    try {
        return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
};

let state: State = {
    theme: (read('theme') as Theme) || 'light',
    sidebarCollapsed: read('sidebar') === 'collapsed',
    mobileSidebar: false,
};

const listeners = new Set<() => void>();

function emit(next: Partial<State>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
}

function applyTheme(theme: Theme) {
    if (typeof document === 'undefined') return;
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
}

function applySidebar() {
    if (typeof document === 'undefined') return;
    // On desktop "toggle-sidebar" hides it; on mobile it shows it (Vristo convention).
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    document.documentElement.classList.toggle('toggle-sidebar', isDesktop ? state.sidebarCollapsed : state.mobileSidebar);
}

if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => state.theme === 'system' && applyTheme('system'));
    window.matchMedia('(min-width: 1024px)').addEventListener('change', applySidebar);
}

export const themeStore = {
    setTheme(theme: Theme) {
        try {
            localStorage.setItem('theme', theme);
        } catch {
            /* ignore */
        }
        applyTheme(theme);
        emit({ theme });
    },
    cycleTheme() {
        const order: Theme[] = ['light', 'dark', 'system'];
        this.setTheme(order[(order.indexOf(state.theme) + 1) % order.length]);
    },
    toggleSidebar() {
        const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
        if (isDesktop) {
            const collapsed = !state.sidebarCollapsed;
            try {
                localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'open');
            } catch {
                /* ignore */
            }
            emit({ sidebarCollapsed: collapsed });
        } else {
            emit({ mobileSidebar: !state.mobileSidebar });
        }
        applySidebar();
    },
    closeMobileSidebar() {
        if (state.mobileSidebar) {
            emit({ mobileSidebar: false });
            applySidebar();
        }
    },
};

export function useTheme() {
    const snapshot = useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => state,
        () => state,
    );
    return { ...snapshot, ...themeStore };
}

export function initializeTheme() {
    applyTheme(state.theme);
    applySidebar();
}
