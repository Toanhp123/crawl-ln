import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Text } from '../data-display/Text';

export function Toolbar({
  title,
  description,
  leading,
  actions,
  sticky = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[var(--toolbar-height)] items-center gap-3 border-b border-border bg-[hsl(var(--color-bg-elevated)/.94)] px-[var(--page-gutter)] py-2 backdrop-blur-xl',
        sticky && 'sticky top-0 z-[var(--z-sticky)] md:top-[var(--height-header)]',
        className
      )}
      {...props}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        {title ? (
          <Text as="div" variant="cardTitle" truncate>
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text as="div" variant="metadata" tone="muted" truncate>
            {description}
          </Text>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
