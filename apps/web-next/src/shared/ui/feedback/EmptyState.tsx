import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconTile } from '../data-display/IconTile';
import { Text } from '../data-display/Text';

export function EmptyState({
  title,
  description,
  action,
  icon,
  density = 'regular',
  className
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  density?: 'compact' | 'regular';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface text-center',
        density === 'compact' ? 'min-h-28 p-3' : 'min-h-36 p-4',
        className
      )}
    >
      <div className="flex max-w-sm flex-col items-center">
        <IconTile size={density === 'compact' ? 'sm' : 'md'} className="mx-auto">
          {icon ?? <Inbox size={20} />}
        </IconTile>
        <Text as="h2" variant="cardTitle" className="mt-2">
          {title}
        </Text>
        {description ? (
          <Text as="p" variant="supporting" tone="muted" className="mt-1 max-w-[28ch]">
            {description}
          </Text>
        ) : null}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
