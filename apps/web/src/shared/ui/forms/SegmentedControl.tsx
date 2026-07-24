import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { nextEnabledIndex, type RadioDirection } from './radio-navigation';

export interface SegmentedControlItem<T extends string> {
  id: T;
  icon?: ReactNode;
  label: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  value,
  items,
  onChange,
  columns = 3,
  ariaLabel,
  disabled = false
}: {
  value: T;
  items: Array<SegmentedControlItem<T>>;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4 | 'auto';
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction: RadioDirection | 0 =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (disabled || !direction) return;
    event.preventDefault();
    const nextIndex = nextEnabledIndex(items, index, direction);
    const nextItem = items[nextIndex];
    if (!nextItem || nextItem.disabled) return;
    onChange(nextItem.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-segmented-control=""
      data-segmented-columns={columns}
      className={cn(
        'grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border',
        columns === 'auto'
          ? 'grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]'
          : columns === 2
            ? 'grid-cols-2'
            : columns === 4
              ? 'grid-cols-4'
              : 'grid-cols-3'
      )}
    >
      {items.map((item, index) => {
        const itemDisabled = disabled || item.disabled;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={value === item.id}
            disabled={itemDisabled}
            tabIndex={value === item.id && !itemDisabled ? 0 : -1}
            data-segmented-item=""
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => !itemDisabled && onChange(item.id)}
            className={cn(
              'flex min-h-[max(var(--control-touch-min),var(--setting-choice-height))] min-w-0 items-center justify-center gap-1.5 whitespace-normal break-words bg-surface2 px-2 py-2 text-center type-label font-semibold transition-[background-color,color] duration-[var(--motion-fast)] disabled:cursor-not-allowed disabled:opacity-60',
              value === item.id
                ? 'bg-primary text-[hsl(var(--color-primary-contrast))]'
                : 'text-secondary hover:bg-surface3'
            )}
          >
            {item.icon}
            <span className="min-w-0">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
