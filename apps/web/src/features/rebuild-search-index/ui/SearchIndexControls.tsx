import { DatabaseZap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchIndexStatus } from '../../../entities/search';
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
import { isSearchIndexRebuildConflict } from '../model/search-index-error';
import { useRebuildSearchIndex } from '../model/use-rebuild-search-index';
import { SearchIndexStatusList } from './SearchIndexStatusList';

type SearchIndexFeedback =
  { tone: 'success'; message: string } | { tone: 'danger'; message: string } | null;

function SearchIndexSkeleton() {
  return (
    <Stack gap="md" role="status" aria-label="Loading Search Index status">
      <Skeleton className="h-44 w-full" />
    </Stack>
  );
}

export function SearchIndexControls() {
  const connectionState = useConnectionStatus();
  const query = useSearchIndexStatus({ connectionState });
  const mutation = useRebuildSearchIndex();
  const { errorMessage, number, t } = useI18n();
  const [feedback, setFeedback] = useState<SearchIndexFeedback>(null);
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

  const scheduleSuccessClear = () => {
    successTimer.current = globalThis.setTimeout(() => {
      setFeedback(null);
      successTimer.current = undefined;
    }, actionFeedbackPolicies.longRunning.successDurationMs);
  };

  const rebuild = async () => {
    clearSuccessTimer();
    setFeedback(null);

    try {
      const result = await mutation.mutateAsync();
      await query.refetch();
      setFeedback({
        tone: 'success',
        message:
          result.indexedDocuments === 0
            ? t('searchIndex.completedEmpty')
            : t('searchIndex.completedCount', {
                count: number(result.indexedDocuments)
              })
      });
      scheduleSuccessClear();
    } catch (error) {
      if (isSearchIndexRebuildConflict(error)) {
        mutation.reset();
        await query.refetch();
        return;
      }

      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'common.requestFailed')
      });
    }
  };

  const hasStatus = query.data !== undefined;
  const serverRunning = query.data?.rebuildRunning ?? false;
  const actionBusy = mutation.isPending || serverRunning;
  const actionState: ActionState = actionBusy ? 'pending' : mutation.status;
  const actionDisabled = !hasStatus || actionBusy;

  return (
    <Panel className="space-y-4" data-search-index-controls="">
      <Text variant="supporting" tone="muted">
        {t('search.indexDescription')}
      </Text>

      {!hasStatus && query.isLoading ? <SearchIndexSkeleton /> : null}

      {!hasStatus && query.isError ? (
        <InlineNotice
          tone="danger"
          title={t('searchIndex.loadFailedTitle')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {t('searchIndex.retry')}
            </Button>
          }
        >
          {errorMessage(query.error, 'common.requestFailed')}
        </InlineNotice>
      ) : null}

      {query.data ? <SearchIndexStatusList status={query.data} /> : null}

      {hasStatus && query.isError ? (
        <InlineNotice tone="warning" title={t('searchIndex.backgroundRefreshFailed')}>
          {errorMessage(query.error, 'common.requestFailed')}
        </InlineNotice>
      ) : null}

      {feedback ? (
        <InlineNotice
          tone={feedback.tone}
          title={feedback.tone === 'danger' ? t('searchIndex.failed') : undefined}
        >
          {feedback.message}
        </InlineNotice>
      ) : null}

      <Button
        full
        actionState={actionState}
        feedbackPolicy="longRunning"
        leadingIcon={<DatabaseZap size={16} />}
        disabled={actionDisabled}
        onClick={() => void rebuild()}
      >
        {actionBusy ? t('searchIndex.runningAction') : t('searchIndex.action')}
      </Button>
    </Panel>
  );
}
