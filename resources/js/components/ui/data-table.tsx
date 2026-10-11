import type { ReactNode } from 'react';
import EmptyState from '@/components/ui/empty-state';
import Pagination from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/types';

export type Column<T> = {
    key: string;
    header: ReactNode;
    render?: (row: T, index: number) => ReactNode;
    className?: string;
    headerClassName?: string;
    align?: 'left' | 'right' | 'center';
};

/**
 * Vristo-styled table. Pass either a Laravel paginator (`paginated`) or a plain array (`rows`).
 * Columns render `row[key]` unless a `render` function is given.
 */
export default function DataTable<T extends { id?: number | string }>({
    columns,
    rows,
    paginated,
    empty = 'No records found',
    emptyDescription,
    onRowClick,
    footer,
    compact,
    striped,
}: {
    columns: Column<T>[];
    rows?: T[];
    paginated?: Paginated<T>;
    empty?: string;
    emptyDescription?: string;
    onRowClick?: (row: T) => void;
    footer?: ReactNode;
    compact?: boolean;
    striped?: boolean;
}) {
    const data = paginated?.data ?? rows ?? [];
    const alignCls = (a?: string) => (a === 'right' ? 'text-end!' : a === 'center' ? 'text-center!' : '');

    return (
        <div>
            <div className="table-responsive">
                <table className={cn('table', compact && 'table-compact', striped && 'table-striped')}>
                    <thead>
                        <tr>
                            {columns.map((c) => (
                                <th key={c.key} className={cn(alignCls(c.align), c.headerClassName)}>
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr className="hover:bg-transparent!">
                                <td colSpan={columns.length}>
                                    <EmptyState title={empty} description={emptyDescription} />
                                </td>
                            </tr>
                        ) : (
                            data.map((row, i) => (
                                <tr key={row.id ?? i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn(onRowClick && 'cursor-pointer')}>
                                    {columns.map((c) => (
                                        <td key={c.key} className={cn(alignCls(c.align), c.className)}>
                                            {c.render ? c.render(row, i) : ((row as Record<string, unknown>)[c.key] as ReactNode) ?? '—'}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                    {footer && <tfoot>{footer}</tfoot>}
                </table>
            </div>
            {paginated && <Pagination meta={paginated as Paginated<unknown>} />}
        </div>
    );
}
