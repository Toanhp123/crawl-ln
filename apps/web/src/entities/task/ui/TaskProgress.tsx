import { taskOutcomeLabel } from '@/entities/task/model/outcome';
import type { Chapter } from '@novel-tool/shared';
import type { CrawlTask } from '../model/types';
import { Badge, Progress } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
export function TaskProgress({ chapters, task }: { chapters: Chapter[]; task?: CrawlTask | null }) {
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
