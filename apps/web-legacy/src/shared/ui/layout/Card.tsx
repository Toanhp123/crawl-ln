import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Text } from '../data-display/Text';

const cardVariants = cva('border border-border bg-surface text-text', {
  variants: {
    padding: {
      none: 'p-0',
      sm: 'p-[var(--card-padding-sm)]',
      md: 'p-[var(--card-padding)]',
      lg: 'p-[var(--card-padding-lg)]'
    },
    radius: {
      md: 'rounded-[var(--radius-md)]',
      lg: 'rounded-[var(--card-radius)]',
      xl: 'rounded-[var(--radius-xl)]'
    },
    elevation: {
      flat: 'shadow-[var(--elevation-0)]',
      raised: 'shadow-[var(--elevation-1)]',
      floating: 'shadow-[var(--elevation-2)]'
    },
    interactive: {
      true: 'transition-[transform,border-color,background-color,box-shadow] duration-[var(--motion-normal)] hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface2 hover:shadow-[var(--elevation-2)] focus-within:border-border-strong'
    }
  },
  defaultVariants: { padding: 'md', radius: 'lg', elevation: 'raised', interactive: false }
});

type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

/** Apple Books compact content container with canonical padding, radius and elevation. */
export function Card({ className, padding, radius, elevation, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ padding, radius, elevation, interactive }), className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-[var(--card-header-gap)]', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-[var(--card-content-gap)] min-w-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-[var(--card-footer-gap)] flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <Text as="h2" variant="cardTitle" className={className} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Text
      as="p"
      variant="supporting"
      tone="muted"
      className={cn('mt-1 max-w-[36ch]', className)}
      {...props}
    />
  );
}
