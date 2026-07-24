import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSchedulerStatus } from '../../../entities/scheduler';
import { useI18n } from '../../../shared/i18n';
import { useConnectionStatus } from '../../../shared/realtime';
import {
  actionFeedbackPolicies,
  Button,
  InlineNotice,
  Panel,
  Skeleton,
  Stack,
  Text,
  type ActionState
} from '../../../shared/ui';
import { useRunScheduler } from '../model/use-run-scheduler';
import { SchedulerStatusList } from './SchedulerStatusList';
import { SchedulerTimingCard } from './SchedulerTimingCard';

type SchedulerFeedback =
  { tone: 'success'; message: string } | { tone: 'danger'; message: string } | null;

function SchedulerSkeleton() {
  return (
    <Stack gap="md" role="status" aria-label="Loading Scheduler status">
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-28 w-full" />
    </Stack>
  );
}

export function SchedulerControls() {
  const connectionState = useConnectionStatus();
  const query = useSchedulerStatus({ connectionState, pollingIntervalMs: 15_000 });
  const mutation = useRunScheduler();
  const { errorMessage, t } = useI18n();
  const [feedback, setFeedback] = useState<SchedulerFeedback>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearSuccessTimer = () => {
    if (successTimer.current !== undefined) {
      globalThis.clearTimeout(successTimer.current);
      successTimer.current = undefined;
    }
  };

  useEffect(
    () => () => {
      if (successTimer.current !== undefined) {
        globalThis.clearTimeout(successTimer.current);
      }
    },
    []
  );

  const run = () => {
    clearSuccessTimer();
    setFeedback(null);

    mutation.mutate(undefined, {
      onSuccess: () => {
        setFeedback({ tone: 'success', message: t('scheduler.completed') });
        successTimer.current = globalThis.setTimeout(() => {
          setFeedback(null);
          successTimer.current = undefined;
        }, actionFeedbackPolicies.longRunning.successDurationMs);
      },
      onError: (error) => {
        setFeedback({
          tone: 'danger',
          message: errorMessage(error, 'common.requestFailed')
        });
      }
    });
  };

  const hasStatus = query.data !== undefined;
  const serverRunning = (query.data?.activeRuns ?? 0) > 0;
  const actionBusy = mutation.isPending || serverRunning;
  const actionState: ActionState = serverRunning ? 'pending' : mutation.status;
  const actionDisabled = !hasStatus || serverRunning;

  return (
    <Panel className="space-y-4" data-scheduler-controls="">
      <Text variant="supporting" tone="muted">
        {t('settings.schedulerDescription')}
      </Text>

      {!hasStatus && query.isLoading ? <SchedulerSkeleton /> : null}

      {!hasStatus && query.isError ? (
        <InlineNotice
          tone="danger"
          title={t('scheduler.loadFailedTitle')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {t('scheduler.retry')}
            </Button>
          }
        >
          {errorMessage(query.error, 'common.requestFailed')}
        </InlineNotice>
      ) : null}

      {query.data ? (
        <Stack gap="md">
          <SchedulerStatusList status={query.data} />
          <SchedulerTimingCard
            lastTickAt={query.data.lastTickAt}
            nextTickAt={query.data.nextTickAt}
          />
        </Stack>
      ) : null}

      {feedback ? (
        <InlineNotice
          tone={feedback.tone}
          title={feedback.tone === 'danger' ? t('scheduler.failed') : undefined}
        >
          {feedback.message}
        </InlineNotice>
      ) : null}

      <Button
        full
        actionState={actionState}
        feedbackPolicy="longRunning"
        leadingIcon={<RefreshCw size={16} />}
        disabled={actionDisabled}
        onClick={run}
      >
        {actionBusy ? t('scheduler.runningAction') : t('scheduler.runNow')}
      </Button>
    </Panel>
  );
}
