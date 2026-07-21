import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Text } from '../data-display/Text';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  compact = false
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={cn(
        'flex min-h-[var(--touch-target)] items-center justify-between gap-3',
        compact ? 'py-0' : 'py-1'
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="hidden type-eyebrow text-primary md:block">{eyebrow}</p> : null}
        <Text as="h1" variant="pageTitle" truncate>
          {title}
        </Text>
        {description ? (
          <Text
            as="p"
            variant="supporting"
            tone="secondary"
            className="mt-[var(--description-title-gap)] hidden max-w-3xl md:block"
          >
            {description}
          </Text>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
