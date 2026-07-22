import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button } from '../../../shared/ui';
import { useRunScheduler } from '../model/use-run-scheduler';

export function RunSchedulerButton() {
  const mutation = useRunScheduler();
  const { t } = useI18n();
  return (
    <Button
      actionState={mutation.status}
      feedbackPolicy="longRunning"
      leadingIcon={<RefreshCw size={16} />}
      onClick={() => mutation.mutate()}
    >
      {t('scheduler.runNow')}
    </Button>
  );
}
