import { cva, type VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const textVariants = cva('', {
  variants: {
    variant: {
      display: 'type-display font-bold tracking-[var(--tracking-tight-title)]',
      pageTitle: 'type-headline font-bold tracking-[var(--tracking-tight-title)]',
      sectionTitle: 'type-title font-semibold tracking-[var(--tracking-tight-title)]',
      cardTitle: 'type-title-sm font-semibold',
      headline: 'type-headline font-bold tracking-[var(--tracking-tight-title)]',
      title: 'type-title font-semibold tracking-[var(--tracking-tight-title)]',
      titleSm: 'type-title-sm font-semibold',
      section: 'type-body font-bold',
      body: 'type-body',
      bodySm: 'type-body-sm',
      label: 'type-label font-semibold',
      supporting: 'type-supporting font-normal',
      metadata: 'type-metadata font-normal',
      caption: 'type-caption',
      metricSm: 'type-metric-sm font-bold tabular-nums',
      metricLg: 'type-metric-lg font-extrabold tabular-nums'
    },
    tone: {
      default: 'text-text',
      secondary: 'text-secondary',
      muted: 'text-muted',
      primary: 'text-primary',
      danger: 'text-danger',
      success: 'text-success'
    },
    truncate: {
      true: 'truncate'
    }
  },
  defaultVariants: { variant: 'body', tone: 'default' }
});

type TextProps<T extends ElementType = 'span'> = {
  as?: T;
  children?: ReactNode;
} & VariantProps<typeof textVariants> &
  HTMLAttributes<HTMLElement>;

export function Text<T extends ElementType = 'span'>({
  as,
  variant,
  tone,
  truncate,
  className,
  ...props
}: TextProps<T>) {
  const Component = as ?? 'span';
  return (
    <Component className={cn(textVariants({ variant, tone, truncate }), className)} {...props} />
  );
}
