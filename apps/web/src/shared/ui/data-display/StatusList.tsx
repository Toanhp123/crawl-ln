import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Text } from './Text';

export type StatusListItem = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
};

export type StatusListProps = Omit<HTMLAttributes<HTMLDListElement>, 'children'> & {
  items: readonly StatusListItem[];
};

export function StatusList({ items, className, ...props }: StatusListProps) {
  return (
    <dl
      className={cn(
        'overflow-hidden rounded-[var(--card-radius)] border border-border bg-surface shadow-[var(--elevation-0)]',
        className
      )}
      {...props}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="grid min-h-[var(--list-row-height)] grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-3 border-b border-border px-[var(--list-item-padding)] py-[var(--list-item-padding-y)] last:border-b-0"
        >
          <Text as="dt" variant="bodySm" className="min-w-0">
            {item.label}
          </Text>
          <dd className="m-0 min-w-0 max-w-[62vw] text-right sm:max-w-[20rem]">
            <Text as="div" variant="supporting">
              {item.value}
            </Text>
            {item.description ? (
              <Text as="div" variant="metadata" tone="muted" className="mt-0.5">
                {item.description}
              </Text>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
