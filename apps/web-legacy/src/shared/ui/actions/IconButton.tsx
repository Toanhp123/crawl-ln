import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
};

export function IconButton({
  className,
  variant = 'default',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-[var(--touch-target)] w-[var(--touch-target)] shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-[background-color,border-color,color,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
        variant === 'danger'
          ? 'border-danger-state-border bg-danger-subtle text-danger hover:bg-danger-state-hover'
          : variant === 'primary'
            ? 'border-primary bg-primary text-[hsl(var(--color-primary-contrast))] hover:bg-primary-hover active:bg-primary-pressed'
            : variant === 'ghost'
              ? 'border-transparent bg-transparent text-secondary hover:bg-surface2 hover:text-text'
              : 'border-border bg-surface text-secondary hover:border-border-strong hover:bg-surface2 hover:text-text',
        className
      )}
      {...props}
    />
  );
}
