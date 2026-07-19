import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-[var(--touch-target)] w-full rounded-[var(--input-radius)] border border-border bg-surface px-3.5 type-body-sm text-text outline-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] placeholder:text-muted hover:border-border-strong focus:border-primary focus:bg-[hsl(var(--color-bg-elevated))] focus:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-muted disabled:opacity-70',
        className
      )}
      {...props}
    />
  );
}
