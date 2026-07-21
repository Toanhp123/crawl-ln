import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
export function StickyActionBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'sticky bottom-[var(--app-nav-total)] z-[var(--z-sticky)] -mx-[var(--page-gutter)] border-t border-border bg-[hsl(var(--color-bg-elevated)/.94)] px-[var(--page-gutter)] py-3 backdrop-blur-xl md:bottom-0',
        className
      )}
      {...props}
    />
  );
}
