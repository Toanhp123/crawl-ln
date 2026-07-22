import type { CrawlTask, Novel } from '@novel-tool/shared';
import { BookOpenText, MoreVertical, RotateCcw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  IconButton,
  ProgressRing,
  Text
} from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

function progressOf(task: CrawlTask) {
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
  const percent = progressOf(task);
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
                <BookOpenText size={20} className="h-4 w-4" />
                {novel?.sourceName ?? task.novelId}
              </Text>
            </div>
            <IconButton
              aria-label={t('common.more')}
              variant="ghost"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical size={20} />
            </IconButton>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Chip
              tone={
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'failed'
                    ? 'danger'
                    : task.status === 'running'
                      ? 'warning'
                      : 'neutral'
              }
            >
              {status(task.status)}
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
                <RotateCcw size={20} className="h-4 w-4" />
                {t('common.retry')}
              </Text>
            ) : null}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
