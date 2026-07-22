import { AlertTriangle, ArrowLeft, BookOpenText, Clock3, ExternalLink } from 'lucide-react';
import { NovelCover } from '@/entities/novel';
import { isTaskActive, taskOutcomeLabel } from '@/entities/task';
import { CancelTaskButton } from '@/features/cancel-task';
import { PauseTaskButton } from '@/features/pause-task';
import { ResumeTaskButton } from '@/features/resume-task';
import { useI18n } from '@/shared/i18n';
import {
  Badge,
  Button,
  ErrorState,
  IconButton,
  LoadingState,
  Page,
  Panel,
  Progress,
  StickyActionBar,
  Text
} from '@/shared/ui';
import { useTaskDetailPage } from '../model/use-task-detail-page';

function percent(total: number, fetched: number, failed: number): number {
  return total ? Math.min(100, Math.round(((fetched + failed) / total) * 100)) : 0;
}

function durationMs(value: number): string {
  const seconds = Math.max(0, Math.floor(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes < 60 ? `${minutes}m ${rest}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function time(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function TaskDetailPage() {
  const { t, status, number } = useI18n();
  const { task, events, novel, navigate } = useTaskDetailPage();

  if (task.isLoading) {
    return (
      <Page>
        <LoadingState title={t('common.loadingData')} />
      </Page>
    );
  }
  if (task.isError || !task.data) {
    return (
      <Page>
        <ErrorState
          title={t('common.error')}
          description={t('common.errorDescription')}
          actionLabel={t('common.retry')}
          onAction={() => void task.refetch()}
        />
      </Page>
    );
  }

  const item = task.data;
  const info = novel.data?.novel;
  const progress = percent(item.totalChapters, item.fetchedChapters, item.failedChapters);
  const processed = item.fetchedChapters + item.failedChapters;
  const active = isTaskActive(item.status);
  const canPause = ['running', 'queued', 'resuming'].includes(item.status);
  const canResume = item.status === 'paused';
  const outcome = taskOutcomeLabel(item, t);
  const stages = [
    { label: t('crawl.detail.analyze'), value: 100, meta: t('crawl.detail.done') },
    { label: t('crawl.detail.fetch'), value: progress, meta: `${processed}/${item.totalChapters}` },
    {
      label: t('crawl.detail.store'),
      value: item.status === 'completed' ? 100 : progress,
      meta: item.status === 'completed' ? t('crawl.detail.done') : status(item.status)
    }
  ];

  return (
    <Page bottomInset="stickyAction" className="space-y-3">
      <div className="grid min-h-12 grid-cols-[2.75rem_1fr_2.75rem] items-center">
        <IconButton aria-label={t('common.previous')} variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={22} />
        </IconButton>
        <h1 className="text-center type-title font-bold">{t('crawl.detail.title')}</h1>
        <span aria-hidden />
      </div>

      <Panel padding="sm">
        <div className="flex gap-3">
          <NovelCover title={info?.title ?? item.novelId} coverUrl={info?.coverUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <Text as="h2" variant="title" className="line-clamp-3">
              {info?.title ?? item.novelId}
            </Text>
            <Text
              as="p"
              variant="supporting"
              tone="primary"
              className="mt-1.5 flex items-center gap-1.5"
              truncate
            >
              <BookOpenText size={14} />
              {info?.sourceName ?? item.novelId}
            </Text>
            <div className="mt-2">
              <Badge
                tone={
                  item.status === 'completed'
                    ? 'success'
                    : item.status === 'failed' || item.status === 'cancelled'
                      ? 'danger'
                      : item.status === 'running'
                        ? 'warning'
                        : 'neutral'
                }
              >
                {outcome}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 type-label text-muted">
          <span>
            {t('crawl.detail.started')}:{' '}
            <strong className="text-secondary">{time(item.createdAt)}</strong>
          </span>
          <span>
            {t('crawl.detail.updated')}:{' '}
            <strong className="text-secondary">{time(item.updatedAt)}</strong>
          </span>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between">
          <Text as="h2" variant="sectionTitle">
            {t('crawl.detail.overall')}
          </Text>
          <strong className="type-title tabular-nums text-primary">{number(progress)}%</strong>
        </div>
        <Progress value={progress} label={t('crawl.detail.overall')} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <strong className="block type-title tabular-nums">
              {number(processed)}/{number(item.totalChapters)}
            </strong>
            <Text variant="caption" tone="muted">
              {t('crawl.detail.processed')}
            </Text>
          </div>
          <div>
            <strong className="block type-title tabular-nums text-success">
              {number(item.fetchedChapters)}
            </strong>
            <Text variant="caption" tone="muted">
              {t('crawl.detail.fetched')}
            </Text>
          </div>
          <div>
            <strong className="block type-title tabular-nums text-danger">
              {number(item.failedChapters)}
            </strong>
            <Text variant="caption" tone="muted">
              {t('crawl.detail.failed')}
            </Text>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center type-label">
          <Panel tone="inset" padding="sm" className="text-muted">
            {t('crawl.detail.speed')}
            <strong className="mt-0.5 block text-secondary">
              {item.currentSpeed.toFixed(2)} ch/s
            </strong>
          </Panel>
          <Panel tone="inset" padding="sm" className="text-muted">
            {t('crawl.detail.averageSpeed')}
            <strong className="mt-0.5 block text-secondary">
              {item.averageSpeed.toFixed(2)} ch/s
            </strong>
          </Panel>
          <Panel tone="inset" padding="sm" className="text-muted">
            {t('crawl.detail.eta')}
            <strong className="mt-0.5 block text-secondary">
              {item.etaSeconds == null ? '—' : durationMs(item.etaSeconds * 1000)}
            </strong>
          </Panel>
          <Panel tone="inset" padding="sm" className="text-muted">
            {t('crawl.detail.pausedTime')}
            <strong className="mt-0.5 block text-secondary">
              {durationMs(item.totalPausedMs)}
            </strong>
          </Panel>
        </div>
      </Panel>

      <Panel>
        <Text as="h2" variant="sectionTitle" className="mb-3">
          {t('crawl.detail.stages')}
        </Text>
        <div className="space-y-3">
          {stages.map((stage) => (
            <div
              key={stage.label}
              className="grid grid-cols-[minmax(0,1fr)_88px_52px] items-center gap-2 type-label"
            >
              <span className="truncate text-secondary">{stage.label}</span>
              <Progress value={stage.value} />
              <span className="text-right font-semibold tabular-nums text-muted">{stage.meta}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <Text as="h2" variant="sectionTitle" className="mb-3">
          {t('crawl.detail.activity')}
        </Text>
        <div className="max-h-72 space-y-3 overflow-y-auto type-label" aria-live="polite">
          {(events.data ?? []).map((event) => (
            <div key={event.id} className="flex gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  event.level === 'error'
                    ? 'bg-danger'
                    : event.level === 'warning'
                      ? 'bg-warning'
                      : event.level === 'success'
                        ? 'bg-success'
                        : 'bg-primary'
                }`}
              />
              <time className="w-16 shrink-0 text-muted">{time(event.createdAt)}</time>
              <span className={event.level === 'error' ? 'text-danger' : ''}>{event.message}</span>
            </div>
          ))}
          {!events.isLoading && !events.data?.length ? (
            <div className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <time className="w-16 shrink-0 text-muted">{time(item.createdAt)}</time>
              <span>{t('crawl.detail.created')}</span>
            </div>
          ) : null}
        </div>
      </Panel>

      {item.failedChapters > 0 ? (
        <Panel padding="sm" className="flex items-start gap-2.5 type-label">
          <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={17} />
          <p>{t('crawl.detail.failedNotice', { count: item.failedChapters })}</p>
        </Panel>
      ) : null}

      <StickyActionBar className="grid grid-cols-2 gap-2">
        {canPause ? (
          <PauseTaskButton taskId={item.id} variant="secondary">
            {t('crawl.detail.pause')}
          </PauseTaskButton>
        ) : canResume ? (
          <ResumeTaskButton taskId={item.id} variant="secondary">
            {t('crawl.detail.resume')}
          </ResumeTaskButton>
        ) : active ? (
          <Button variant="secondary" disabled>
            <Clock3 size={16} />
            {status(item.status)}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => navigate('/activity')}>
            <Clock3 size={16} />
            {t('nav.activity')}
          </Button>
        )}
        {active ? (
          <CancelTaskButton taskId={item.id}>{t('crawl.detail.stop')}</CancelTaskButton>
        ) : (
          <Button onClick={() => navigate(`/library/${encodeURIComponent(item.novelId)}`)}>
            <ExternalLink size={16} />
            {t('crawl.detail.openNovel')}
          </Button>
        )}
      </StickyActionBar>
    </Page>
  );
}
