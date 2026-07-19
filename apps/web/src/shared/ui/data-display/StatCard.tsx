import type { ReactNode } from 'react';
import { Panel } from '../layout/Panel';
import { Text } from './Text';

export function StatCard({
  label,
  value,
  icon
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Panel className="min-h-[4.5rem]">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <Text variant="label" tone="muted" truncate>
          {label}
        </Text>
      </div>
      <Text as="div" variant="metricSm" className="mt-1 tracking-[var(--tracking-tight-title)]">
        {value}
      </Text>
    </Panel>
  );
}
