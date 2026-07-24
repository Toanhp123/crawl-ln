import { Check } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Card } from '../layout/Card';
import { ListRow } from '../data-display/ListRow';
import { nextEnabledIndex, type RadioDirection } from '../forms/radio-navigation';

export interface SettingsOptionItem<T extends string> {
  id: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export function SettingsOptionList<T extends string>({
  ariaLabel,
  value,
  items,
  onChange,
  disabled = false
}: {
  ariaLabel: string;
  value: T;
  items: Array<SettingsOptionItem<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
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
    <Card
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      padding="none"
      elevation="flat"
      className="overflow-hidden"
      data-settings-option-list=""
    >
      {items.map((item, index) => {
        const itemDisabled = disabled || item.disabled;
        const selected = value === item.id;
        return (
          <ListRow
            key={item.id}
            role="radio"
            aria-checked={selected}
            disabled={itemDisabled}
            tabIndex={selected && !itemDisabled ? 0 : -1}
            leading={item.icon}
            title={item.label}
            description={item.description}
            trailing={
              selected ? <Check size={17} className="text-primary" aria-hidden="true" /> : null
            }
            divided
            insetFocus
            className="min-h-[var(--setting-row-height)] disabled:cursor-not-allowed disabled:opacity-60"
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index)}
            onClick={() => !itemDisabled && onChange(item.id)}
          />
        );
      })}
    </Card>
  );
}
