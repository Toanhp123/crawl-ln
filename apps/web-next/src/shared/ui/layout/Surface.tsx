import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const variants = cva('border border-border text-text', {
  variants: {
    tone: {
      default: 'bg-surface',
      subtle: 'bg-surface2'
    },
    radius: {
      md: 'rounded-[var(--radius-md)]',
      lg: 'rounded-[var(--radius-lg)]',
      xl: 'rounded-[var(--radius-xl)]'
    }
  },
  defaultVariants: { tone: 'default', radius: 'lg' }
});

type Props = HTMLAttributes<HTMLDivElement> & VariantProps<typeof variants>;

/** Structural background layer. Surface never owns padding or elevation. */
export function Surface({ className, tone, radius, ...props }: Props) {
  return <div className={cn(variants({ tone, radius }), className)} {...props} />;
}
