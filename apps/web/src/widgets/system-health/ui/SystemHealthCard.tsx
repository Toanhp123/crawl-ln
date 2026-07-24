import { Activity, CalendarClock, Database } from 'lucide-react';
import { useSchedulerStatus } from '@/entities/scheduler';
import { useConnectionStatus } from '@/shared/realtime';
import { useI18n } from '@/shared/i18n';
import { Badge, Card, Panel, Text } from '@/shared/ui';

export function SystemHealthCard() {
  const { t, number } = useI18n();
  const connectionState = useConnectionStatus();
  const scheduler = useSchedulerStatus({ connectionState, pollingIntervalMs: 15_000 });
  const healthy = Boolean(scheduler.data?.running) && !scheduler.error;
  const rows = [
    {
      icon: CalendarClock,
      label: t('settings.healthScheduler'),
      value: healthy ? t('settings.healthHealthy') : t('settings.healthAttention'),
      tone: healthy ? ('success' as const) : ('warning' as const),
      detail: `${number(scheduler.data?.monitoredNovels ?? 0)} ${t('settings.healthMonitored')}`
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
            <div className="flex items-center justify-between">
              <div>
                <span className="flex items-center gap-2 type-body-sm font-bold">
                  <Icon size={16} />
                  {label}
                </span>
                <Text variant="caption" tone="muted" className="mt-2">
                  {detail}
                </Text>
              </div>
              <Badge tone={tone}>{value}</Badge>
            </div>
          </Panel>
        ))}
      </div>
    </Card>
  );
}
