import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const panelVariants = cva('text-text', {
  variants: {
    tone: {
      subtle: 'border border-border bg-surface2',
      default: 'border border-border bg-surface',
      inset: 'bg-surface2'
    },
    padding: {
      none: 'p-0',
      sm: 'p-[var(--panel-padding-sm)]',
      md: 'p-[var(--panel-padding-md)]',
      lg: 'p-[var(--panel-padding-lg)]'
    },
    radius: {
      md: 'rounded-[var(--radius-md)]',
      lg: 'rounded-[var(--radius-lg)]'
    }
  },
  defaultVariants: { tone: 'subtle', padding: 'md', radius: 'md' }
});

type PanelProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof panelVariants>;

/** Dense grouping surface. Panel intentionally has no elevation. */
export function Panel({ className, tone, padding, radius, ...props }: PanelProps) {
  return <div className={cn(panelVariants({ tone, padding, radius }), className)} {...props} />;
}
