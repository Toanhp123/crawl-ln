import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  IconTile,
  Text,
  type ChipTone
} from '@/shared/ui';

export function SettingsHubCard({
  icon,
  title,
  description,
  currentValue,
  status,
  statusTone = 'neutral',
  disabled = false,
  cardId,
  onClick
}: {
  icon: ReactNode;
  title: string;
  description: string;
  currentValue?: string;
  status?: string;
  statusTone?: ChipTone;
  disabled?: boolean;
  cardId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-settings-hub-card={cardId ?? ''}
      className="group block w-full rounded-[var(--card-radius)] text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      onClick={onClick}
    >
      <Card
        interactive={!disabled}
        className="h-full transition-transform group-active:scale-[.995]"
      >
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
              {currentValue ? (
                <Text
                  variant="metadata"
                  tone="secondary"
                  className="mt-2 block font-semibold"
                  data-settings-current-value=""
                >
                  {currentValue}
                </Text>
              ) : null}
            </div>
          </div>
          <ChevronRight
            size={20}
            className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </CardHeader>
      </Card>
    </button>
  );
}
