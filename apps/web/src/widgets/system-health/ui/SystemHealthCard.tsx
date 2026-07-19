import { Activity, CalendarClock, Database } from 'lucide-react';
import { Badge, Card, Panel, Text } from '@/shared/ui';
import type { TranslationKey } from '@/shared/i18n/I18nProvider';

export function SystemHealthCard({
  t,
  schedulerHealthy,
  monitoredNovels
}: {
  t: (key: TranslationKey) => string;
  schedulerHealthy: boolean;
  monitoredNovels: number;
}) {
  const rows = [
    {
      icon: CalendarClock,
      label: t('settings.healthScheduler'),
      value: schedulerHealthy ? t('settings.healthHealthy') : t('settings.healthAttention'),
      tone: schedulerHealthy ? ('success' as const) : ('warning' as const),
      detail: `${monitoredNovels} ${t('settings.healthMonitored')}`
    },
    {
      icon: Database,
      label: t('settings.healthDatabase'),
      value: t('settings.healthLocal'),
      tone: 'info' as const,
      detail: t('settings.storageModeValue')
    }
  ];

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface2 text-primary">
          <Activity size={20} />
        </span>
        <div>
          <Text as="h2" variant="title">
            {t('settings.systemHealth')}
          </Text>
          <Text variant="supporting" tone="muted">
            {t('settings.systemHealthDescription')}
          </Text>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(({ icon: Icon, label, value, tone, detail }) => (
          <Panel key={label}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 type-body-sm font-bold">
                <Icon size={16} />
                {label}
              </span>
              <Badge tone={tone}>{value}</Badge>
            </div>
            <Text variant="caption" tone="muted" className="mt-2">
              {detail}
            </Text>
          </Panel>
        ))}
      </div>
    </Card>
  );
}
