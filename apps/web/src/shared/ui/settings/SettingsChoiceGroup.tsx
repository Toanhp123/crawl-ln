import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { FilterChip } from '../forms/FilterChip';
import { nextEnabledIndex, type RadioDirection } from '../forms/radio-navigation';
import { Text } from '../data-display/Text';

export interface SettingsChoiceItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  swatch?: ReactNode;
  disabled?: boolean;
}

export function SettingsChoiceGroup<T extends string>({
  label,
  value,
  items,
  onChange,
  disabled = false,
  layout = 'content'
}: {
  label: string;
  value: T;
  items: Array<SettingsChoiceItem<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  layout?: 'content' | 'balanced';
}) {
  const labelId = useId();
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction: RadioDirection | 0 =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!direction || disabled) return;
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
    <section data-settings-choice-group="" data-settings-choice-layout={layout}>
      <Text as="h3" id={labelId} variant="label" tone="secondary" className="mb-2 block">
        {label}
      </Text>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-disabled={disabled || undefined}
        className="flex flex-wrap gap-2"
      >
        {items.map((item, index) => {
          const itemDisabled = disabled || item.disabled;
          return (
            <FilterChip
              key={item.id}
              role="radio"
              aria-checked={value === item.id}
              aria-pressed={undefined}
              selected={value === item.id}
              disabled={itemDisabled}
              tabIndex={value === item.id && !itemDisabled ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => !itemDisabled && onChange(item.id)}
              className={cn(
                'min-h-[var(--control-touch-min)] whitespace-normal px-3 py-1.5',
                layout === 'balanced' && 'basis-[calc(50%-var(--space-1))] sm:basis-auto'
              )}
            >
              {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
              {item.swatch ? <span aria-hidden="true">{item.swatch}</span> : null}
              <span>{item.label}</span>
            </FilterChip>
          );
        })}
      </div>
    </section>
  );
}
