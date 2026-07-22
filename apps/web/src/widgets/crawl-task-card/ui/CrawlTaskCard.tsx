import { BookOpenText, RotateCcw } from 'lucide-react';
import type { Novel } from '@/entities/novel';
import { taskOutcomeLabel, type CrawlTask } from '@/entities/task';
import { useI18n } from '@/shared/i18n';
import { Card, CardContent, CardHeader, CardTitle, Chip, ProgressRing, Text } from '@/shared/ui';

export function taskProgressPercent(task: CrawlTask): number {
  if (!task.totalChapters) return 0;
  return Math.min(
    100,
    Math.round(((task.fetchedChapters + task.failedChapters) / task.totalChapters) * 100)
  );
}

export function CrawlTaskCard({
  task,
  novel,
  onOpen
}: {
  task: CrawlTask;
  novel?: Novel;
  onOpen?: () => void;
}) {
  const { t, status, number } = useI18n();
  const percent = taskProgressPercent(task);
  const outcome = taskOutcomeLabel(task, t);
  const tone =
    task.status === 'completed' ? 'success' : task.status === 'failed' ? 'danger' : 'primary';
  const activate = () => onOpen?.();

  return (
    <Card
      padding="sm"
      interactive={Boolean(onOpen)}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (onOpen && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          activate();
        }
      }}
      className={
        onOpen
          ? 'cursor-pointer focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <ProgressRing value={percent} tone={tone} size={64} stroke={6} />
        <div className="min-w-0 flex-1">
          <CardHeader>
            <div className="min-w-0 flex-1">
              <CardTitle className="line-clamp-2">
                {novel?.title ?? t('activity.taskFallback', { id: task.id.slice(0, 8) })}
              </CardTitle>
              <Text
                as="p"
                variant="metadata"
                tone="muted"
                className="mt-1 flex items-center gap-1.5"
                truncate
              >
                <BookOpenText size={16} />
                {novel?.sourceName ?? task.novelId}
              </Text>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Chip
              tone={
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'failed' || task.status === 'cancelled'
                    ? 'danger'
                    : task.status === 'running'
                      ? 'warning'
                      : 'neutral'
              }
            >
              {outcome || status(task.status)}
            </Chip>
            <Text variant="metadata" tone="secondary" className="font-medium tabular-nums">
              {t('activity.chapterProgress', {
                fetched: number(task.fetchedChapters),
                total: number(task.totalChapters)
              })}
            </Text>
            {task.status === 'failed' ? (
              <Text
                variant="metadata"
                tone="danger"
                className="ml-auto inline-flex items-center gap-1 font-semibold"
              >
                <RotateCcw size={15} />
                {t('common.retry')}
              </Text>
            ) : null}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
