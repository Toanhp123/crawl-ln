import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/55',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left type-body-sm">{children}</table>
      </div>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface2/70 type-caption uppercase tracking-wider text-muted">
      {children}
    </thead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function DataTableHeaderCell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        'px-[var(--table-cell-x)] py-[var(--table-cell-y)] text-left font-black',
        className
      )}
    >
      {children}
    </th>
  );
}

export function DataTableCell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-[var(--table-cell-x)] py-[var(--table-cell-y)] align-middle text-text',
        className
      )}
    >
      {children}
    </td>
  );
}
