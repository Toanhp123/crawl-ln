import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle, Chip, IconTile } from '@/shared/ui';

export function SettingsHubCard({
  icon,
  title,
  description,
  status,
  statusTone = 'neutral',
  onClick
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: string;
  statusTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  onClick: () => void;
}) {
  return (
    <button type="button" className="block w-full text-left" onClick={onClick}>
      <Card interactive>
        <CardHeader className="items-center">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile size="md" tone="primary">
              {icon}
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{title}</CardTitle>
                {status ? <Chip tone={statusTone}>{status}</Chip> : null}
              </div>
              <CardDescription className="max-w-[32ch]">{description}</CardDescription>
            </div>
          </div>
          <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
        </CardHeader>
      </Card>
    </button>
  );
}
