import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function ResponsiveSplit({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'grid gap-[var(--content-gap)] lg:grid-cols-[minmax(18rem,var(--sidebar-width))_minmax(0,1fr)] lg:items-start',
        className
      )}
      {...props}
    />
  );
}
