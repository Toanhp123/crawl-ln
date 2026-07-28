import type { ReactNode } from 'react';
import { cn } from '../../../shared/lib/cn';

export function PluginStudioPanelRail({
  side,
  label,
  children
}: {
  side: 'left' | 'right';
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'flex h-full w-full flex-col items-center gap-1 bg-surface2 px-1 py-2',
        side === 'left' ? 'border-r border-border' : 'border-l border-border'
      )}
    >
      {children}
    </nav>
  );
}
