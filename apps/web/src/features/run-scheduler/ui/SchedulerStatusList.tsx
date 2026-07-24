import type { SchedulerStatus } from '../../../entities/scheduler';
import { useI18n } from '../../../shared/i18n';
import { Chip, StatusList } from '../../../shared/ui';
import { getSchedulerDisplayState } from '../model/scheduler-presentation';

export function SchedulerStatusList({ status }: { status: SchedulerStatus }) {
  const { number, t } = useI18n();
  const state = getSchedulerDisplayState(status);

  return (
    <StatusList
      aria-label={t('scheduler.statusList')}
      data-scheduler-status-list=""
      items={[
        {
          key: 'state',
          label: t('scheduler.state'),
          value: (
            <Chip tone={state.tone} size="sm">
              {t(`scheduler.state.${state.key}`)}
            </Chip>
          )
        },
        {
          key: 'monitored',
          label: t('scheduler.monitoredNovels'),
          value: number(status.monitoredNovels)
        },
        {
          key: 'due',
          label: t('scheduler.dueNovels'),
          value: number(status.dueNovels)
        },
        {
          key: 'active',
          label: t('scheduler.activeRuns'),
          value: number(status.activeRuns)
        }
      ]}
    />
  );
}
