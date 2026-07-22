import type { CrawlTask } from './types';

type OutcomeTranslator = (
  key:
    | 'tasks.outcome.success'
    | 'tasks.outcome.partial'
    | 'tasks.outcome.failure'
    | 'common.status.completed'
    | 'common.status.failed'
    | 'common.status.cancelled'
    | 'common.status.running'
    | 'common.status.queued'
) => string;

export function taskOutcomeLabel(task: CrawlTask, t: OutcomeTranslator): string {
  if (task.outcome === 'partial') return t('tasks.outcome.partial');
  if (task.outcome === 'failure') return t('tasks.outcome.failure');
  if (task.outcome === 'success') return t('tasks.outcome.success');
  if (task.status === 'completed') return t('common.status.completed');
  if (task.status === 'failed') return t('common.status.failed');
  if (task.status === 'cancelled') return t('common.status.cancelled');
  if (task.status === 'running') return t('common.status.running');
  return t('common.status.queued');
}
