import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Text } from '../data-display/Text';

export type InlineNoticeTone = 'info' | 'success' | 'warning' | 'danger';

export type InlineNoticeProps = {
  tone?: InlineNoticeTone;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function InlineNotice({
  tone = 'info',
  title,
  action,
  children,
  className
}: InlineNoticeProps) {
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
              : 'border-info-state-border bg-info-subtle text-info',
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {title ? (
            <Text as="div" variant="label" className="text-inherit">
              {title}
            </Text>
          ) : null}
          <div className={cn(title && 'mt-0.5')}>{children}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
