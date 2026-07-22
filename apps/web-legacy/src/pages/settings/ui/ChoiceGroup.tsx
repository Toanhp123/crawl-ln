import type { ReactNode } from 'react';
import { FilterChip } from '@/shared/ui';

export function ChoiceGroup<T extends string>({
  label,
  value,
  items,
  onChange
}: {
  label: string;
  value: T;
  items: Array<{ id: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 type-label font-semibold text-secondary">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <FilterChip
            key={item.id}
            selected={value === item.id}
            onClick={() => onChange(item.id)}
            className="inline-flex items-center gap-1.5"
          >
            {item.icon}
            {item.label}
          </FilterChip>
        ))}
      </div>
    </section>
  );
}
