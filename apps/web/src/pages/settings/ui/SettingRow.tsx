import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { ListRow, Text } from '@/shared/ui';

export function SettingRow({
  label,
  value,
  onClick,
  selected,
  icon,
  trailing
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  selected?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
  const trailingContent = (
    <div className="flex items-center gap-2">
      {value ? (
        <Text variant="caption" tone="muted">
          {value}
        </Text>
      ) : null}
      {selected ? <Check size={16} className="text-primary" aria-hidden="true" /> : null}
      {trailing}
    </div>
  );

  return (
    <ListRow
      leading={icon}
      title={label}
      trailing={trailingContent}
      divided
      insetFocus
      {...(onClick ? { onClick } : {})}
    />
  );
}
