import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const chipVariants = cva(
  'inline-flex min-w-max items-center justify-center rounded-pill border font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface2 text-secondary',
        primary: 'border-primary-state-border bg-primary-subtle text-primary',
        success: 'border-success-state-border bg-success-subtle text-success',
        warning: 'border-warning-state-border bg-warning-subtle text-warning',
        danger: 'border-danger-state-border bg-danger-subtle text-danger',
        info: 'border-info-state-border bg-info-subtle text-info'
      },
      size: {
        sm: 'min-h-6 gap-1 px-2 py-0.5 type-caption',
        md: 'min-h-10 gap-1.5 px-3 type-label'
      },
      selected: {
        true: 'border-primary-state-border bg-primary-selected text-primary shadow-[var(--elevation-1)]'
      },
      interactive: {
        true: 'hover:border-border-strong hover:bg-surface2 hover:text-text active:scale-[.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-60'
      }
    },
    defaultVariants: { tone: 'neutral', size: 'sm', selected: false, interactive: false }
  }
);

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>['tone']>;

export type ChipProps = {
  children?: ReactNode;
  className?: string;
  tone?: ChipTone;
  size?: NonNullable<VariantProps<typeof chipVariants>['size']>;
  selected?: boolean;
} & (
  | ({ onClick: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onClick']> } & Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      'children' | 'className' | 'onClick'
    >)
  | ({ onClick?: undefined } & Omit<
      HTMLAttributes<HTMLSpanElement>,
      'children' | 'className' | 'onClick'
    >)
);

export function Chip({ children, className, tone, size, selected, ...props }: ChipProps) {
  if ('onClick' in props && props.onClick) {
    const { onClick, type = 'button', ...buttonProps } = props;
    return (
      <button
        type={type}
        aria-pressed={selected || undefined}
        onClick={onClick}
        className={cn(
          chipVariants({ tone, size: size ?? 'md', selected, interactive: true }),
          className
        )}
        {...buttonProps}
      >
        {children}
      </button>
    );
  }

  const { onClick: _onClick, ...spanProps } = props;
  return (
    <span
      className={cn(chipVariants({ tone, size, selected, interactive: false }), className)}
      {...spanProps}
    >
      {children}
    </span>
  );
}
