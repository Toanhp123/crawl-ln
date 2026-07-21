import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Text } from '../data-display/Text';

export function Section({
  title,
  description,
  action,
  children,
  className
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-[var(--section-content-gap)]', className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-[var(--section-header-gap)] px-0.5">
          <div className="min-w-0">
            {title ? (
              <Text as="h2" variant="sectionTitle">
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text as="p" variant="supporting" tone="muted" className="mt-1 max-w-[42ch]">
                {description}
              </Text>
            ) : null}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
