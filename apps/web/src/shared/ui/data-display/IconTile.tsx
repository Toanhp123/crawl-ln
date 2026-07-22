import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const iconTileVariants = cva('grid shrink-0 place-items-center', {
  variants: {
    size: {
      sm: 'h-[var(--icon-box-sm)] w-[var(--icon-box-sm)]',
      md: 'h-[var(--icon-box-md)] w-[var(--icon-box-md)]',
      lg: 'h-[var(--icon-box-lg)] w-[var(--icon-box-lg)]'
    },
    shape: {
      rounded: 'rounded-[var(--radius-md)]',
      circle: 'rounded-pill'
    },
    tone: {
      neutral: 'bg-surface2 text-muted',
      primary: 'bg-primary-subtle text-primary',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-danger-subtle text-danger',
      info: 'bg-info-subtle text-info'
    }
  },
  defaultVariants: { size: 'md', shape: 'rounded', tone: 'neutral' }
});

export function IconTile({
  className,
  size,
  shape,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof iconTileVariants>) {
  return <span className={cn(iconTileVariants({ size, shape, tone }), className)} {...props} />;
}
