import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function ActionBar({
  children,
  sticky = false,
  className
}: {
  children: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center',
        sticky &&
          'sticky bottom-[calc(var(--height-bottom-nav)+var(--space-3)+env(safe-area-inset-bottom))] z-20 rounded-[var(--radius-lg)] border border-border bg-[hsl(var(--color-bg-elevated)/0.94)] p-2 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:p-0 ',
        className
      )}
    >
      {children}
    </div>
  );
}
