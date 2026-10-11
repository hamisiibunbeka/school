import type { ApexOptions } from 'apexcharts';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTheme } from '@/hooks/use-theme';

// react-apexcharts is CommonJS: depending on the bundler its default export may be wrapped
// ({ default: Chart }), so unwrap it before handing it to React.lazy.
const ReactApexChart = lazy(() =>
    import('react-apexcharts').then((m) => {
        const mod = m as unknown as { default: unknown };
        const component = (mod.default as { default?: unknown })?.default ?? mod.default;
        return { default: component as typeof import('react-apexcharts').default };
    }),
);

/** Vristo palette for series */
export const chartColors = ['#4361ee', '#00ab55', '#e2a03f', '#e7515a', '#2196f3', '#805dca', '#3b3f5c'];

function useIsDark() {
    const { theme } = useTheme();
    const [dark, setDark] = useState(false);
    useEffect(() => {
        setDark(document.documentElement.classList.contains('dark'));
    }, [theme]);
    return dark;
}

/**
 * ApexCharts wrapper with theme-aware defaults. Lazy-loaded so the heavy
 * chart library only ships on pages that render charts.
 */
export default function Chart({
    type,
    series,
    options = {},
    height = 300,
}: {
    type: 'line' | 'area' | 'bar' | 'donut' | 'pie' | 'radialBar';
    series: ApexOptions['series'];
    options?: ApexOptions;
    height?: number;
}) {
    const isDark = useIsDark();
    // ApexCharts needs `window`; only load it in the browser (never during server rendering).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const base: ApexOptions = {
        chart: { fontFamily: 'Nunito, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', ...options.chart },
        colors: options.colors ?? chartColors,
        dataLabels: options.dataLabels ?? { enabled: false },
        grid: { borderColor: isDark ? '#191e3a' : '#e0e6ed', strokeDashArray: 5, ...options.grid },
        theme: { mode: isDark ? 'dark' : 'light' },
        legend: { position: 'top', horizontalAlign: 'right', fontSize: '13px', ...options.legend },
        tooltip: { theme: isDark ? 'dark' : 'light', ...options.tooltip },
    };

    // Never pass `stroke: undefined` — ApexCharts would drop its defaults and crash.
    const stroke = options.stroke ?? (type === 'line' || type === 'area' ? { curve: 'smooth', width: 2.5 } : null);
    if (stroke) {
        base.stroke = stroke;
    }

    const placeholder = <div className="animate-pulse rounded-md bg-white-light/40 dark:bg-[#1b2e4b]/40" style={{ height }} />;

    if (!mounted) {
        return placeholder;
    }

    return (
        <Suspense fallback={placeholder}>
            <ReactApexChart key={isDark ? 'd' : 'l'} type={type} series={series} height={height} options={{ ...options, ...base }} />
        </Suspense>
    );
}
