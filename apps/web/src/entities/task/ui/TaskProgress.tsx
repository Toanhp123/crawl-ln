import { taskOutcomeLabel } from '../model/outcome';
import type { CrawlTask } from '../api/task-api';
import { Badge, Progress } from '../../../shared/ui';
import { useI18n } from '../../../shared/i18n';
export type TaskProgressChapter = { status: 'pending' | 'fetched' | 'failed' };

export function TaskProgress({
  chapters,
  task
}: {
  chapters: TaskProgressChapter[];
  task?: CrawlTask | null;
}) {
  const { t, status } = useI18n();
  const total = task?.totalChapters ?? chapters.length;
  const fetched = task?.fetchedChapters ?? chapters.filter((c) => c.status === 'fetched').length;
  const failed = task?.failedChapters ?? chapters.filter((c) => c.status === 'failed').length;
  const percent = total ? Math.round(((fetched + failed) / total) * 100) : 0;
  const raw = task?.status ?? 'idle';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge
          tone={
            raw === 'completed'
              ? 'success'
              : raw === 'failed'
                ? 'danger'
                : raw === 'running'
                  ? 'warning'
                  : 'neutral'
          }
        >
          {task ? taskOutcomeLabel(task, t) : status(raw)}
        </Badge>
        <span className="type-caption font-semibold text-muted">
          {t('tasks.progress', { fetched, total, failed })}
        </span>
      </div>
      <Progress value={percent} />
    </div>
  );
}
