import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Toolbar } from './Toolbar';

export function StickyToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Toolbar sticky className={cn('-mx-[var(--page-gutter)]', className)} {...props} />;
}
