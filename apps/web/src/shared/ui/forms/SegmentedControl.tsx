import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function SegmentedControl<T extends string>({
  value,
  items,
  onChange,
  columns = 3,
  ariaLabel,
  disabled = false
}: {
  value: T;
  items: Array<{ id: T; icon?: ReactNode; label: string }>;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (disabled || !direction) return;
    event.preventDefault();
    const nextIndex = (index + direction + items.length) % items.length;
    onChange(items[nextIndex].id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        'grid overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface2',
        columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3'
      )}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          disabled={disabled}
          tabIndex={value === item.id ? 0 : -1}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onClick={() => onChange(item.id)}
          className={cn(
            'flex min-h-[var(--setting-choice-height)] items-center disabled:cursor-not-allowed disabled:opacity-60 justify-center gap-1.5 border-r border-border px-1.5 py-1.5 type-caption font-semibold transition-[background-color,color] duration-[var(--motion-fast)] last:border-r-0',
            value === item.id
              ? 'bg-primary text-[hsl(var(--color-primary-contrast))]'
              : 'text-secondary hover:bg-surface3'
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
