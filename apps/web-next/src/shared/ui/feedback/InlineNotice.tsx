import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
export function InlineNotice({
  tone = 'info',
  children
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-[var(--radius-md)] border px-3 py-2 type-body-sm',
        tone === 'danger'
          ? 'border-danger-state-border bg-danger-subtle text-danger'
          : tone === 'warning'
            ? 'border-warning-state-border bg-warning-subtle text-warning'
            : tone === 'success'
              ? 'border-success-state-border bg-success-subtle text-success'
              : 'border-info-state-border bg-info-subtle text-info'
      )}
    >
      {children}
    </div>
  );
}
