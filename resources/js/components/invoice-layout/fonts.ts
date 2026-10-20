import { useEffect } from 'react';
import { SYSTEM_FONTS } from './schema';

const loaded = new Set<string>();

/** Load Google Fonts on demand (system fonts need nothing). Safe to call with the same font many times. */
export function useLayoutFonts(fonts: string[]): void {
    const key = [...new Set(fonts)].sort().join('|');

    useEffect(() => {
        const wanted = key.split('|').filter((f) => f && !SYSTEM_FONTS.includes(f) && !loaded.has(f));
        if (!wanted.length) return;
        wanted.forEach((f) => loaded.add(f));
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?${wanted.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,400;0,600;0,700;1,400`).join('&')}&display=swap`;
        document.head.appendChild(link);
    }, [key]);
}
