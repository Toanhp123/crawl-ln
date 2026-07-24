import { useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { StatusList } from '../../../shared/ui';
import { formatSchedulerTimestamp } from '../model/scheduler-time';

const localeByLanguage = {
  en: 'en-US',
  vi: 'vi-VN'
} as const;

export function SchedulerTimingCard({
  lastTickAt,
  nextTickAt,
  refreshIntervalMs = 30_000
}: {
  lastTickAt?: string;
  nextTickAt?: string;
  refreshIntervalMs?: number;
}) {
  const { language, t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), refreshIntervalMs);
    return () => globalThis.clearInterval(timer);
  }, [refreshIntervalMs]);

  const locale = localeByLanguage[language];
  const last = formatSchedulerTimestamp(lastTickAt, { locale, now });
  const next = formatSchedulerTimestamp(nextTickAt, { locale, now });

  return (
    <StatusList
      aria-label={t('scheduler.timingList')}
      data-scheduler-timing-list=""
      items={[
        {
          key: 'last',
          label: t('scheduler.lastRun'),
          value: last?.relative ?? t('scheduler.neverRun'),
          description: last?.absolute
        },
        {
          key: 'next',
          label: t('scheduler.nextRun'),
          value: next?.relative ?? t('scheduler.notScheduled'),
          description: next?.absolute
        }
      ]}
    />
  );
}
