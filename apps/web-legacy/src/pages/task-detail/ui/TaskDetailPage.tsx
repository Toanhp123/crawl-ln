import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Check,
  Clock3,
  ExternalLink,
  Pause,
  Play,
  Square,
  X
} from 'lucide-react';
import { taskOutcomeLabel } from '@/entities/task/model/outcome';
import { useI18n } from '@/shared/i18n/I18nProvider';
import {
  Badge,
  Button,
  ErrorState,
  IconButton,
  LoadingState,
  Page,
  Panel,
  Progress,
  StickyActionBar
} from '@/shared/ui';
import { NovelCover } from '@/entities/novel/ui/NovelCover';
import { useTaskDetailPage } from '../model/useTaskDetailPage';

function percent(total: number, fetched: number, failed: number) {
  return total ? Math.min(100, Math.round(((fetched + failed) / total) * 100)) : 0;
}
function duration(start: string, end: string) {
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes < 60 ? `${minutes}m ${rest}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function time(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function TaskDetailPage() {
  const { t, status } = useI18n();
  const { task, events, novel, cancel, pause, resume, navigate } = useTaskDetailPage();
  if (task.isLoading)
    return (
      <Page>
        <LoadingState title={t('common.loadingData')} />
      </Page>
    );
  if (task.isError || !task.data)
    return (
      <Page>
        <ErrorState
          title={t('common.error')}
          description={t('common.errorDescription')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void task.refetch();
          }}
        />
      </Page>
    );
  const item = task.data;
  const info = novel.data?.novel;
  const progress = percent(item.totalChapters, item.fetchedChapters, item.failedChapters);
  const active = ['running', 'queued', 'pausing', 'resuming'].includes(item.status);
  const canPause =
    item.status === 'running' || item.status === 'queued' || item.status === 'resuming';
  const canResume = item.status === 'paused';
  const tone =
    item.status === 'completed'
      ? 'success'
      : item.status === 'failed' || item.status === 'cancelled'
        ? 'danger'
        : 'primary';
  const processed = item.fetchedChapters + item.failedChapters;
  const stages = [
    { label: t('crawl.detail.analyze'), value: 100, done: true, meta: t('crawl.detail.done') },
    {
      label: t('crawl.detail.fetch'),
      value: progress,
      done: item.status === 'completed',
      meta: `${processed}/${item.totalChapters}`
    },
    {
      label: t('crawl.detail.store'),
      value: item.status === 'completed' ? 100 : progress,
      done: item.status === 'completed',
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
            <h2 className="line-clamp-3 type-title font-bold">{info?.title ?? item.novelId}</h2>
            <p className="mt-1.5 flex items-center gap-1.5 truncate type-body-sm text-primary">
              <BookOpenText size={14} />
              {info?.sourceName ?? item.novelId}
            </p>
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
                {taskOutcomeLabel(item, t)}
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
          <h2 className="type-title-sm font-bold">{t('crawl.detail.overall')}</h2>
          <strong className="type-metric-sm text-primary">{progress}%</strong>
        </div>
        <div className="mt-3">
          <Progress value={progress} />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border text-center">
          <div>
            <strong className="block type-title tabular-nums">
              {processed}/{item.totalChapters}
            </strong>
            <span className="type-caption text-muted">{t('crawl.detail.processed')}</span>
          </div>
          <div>
            <strong className="block type-title tabular-nums text-success">
              {item.fetchedChapters}
            </strong>
            <span className="type-caption text-muted">{t('crawl.detail.fetched')}</span>
          </div>
          <div>
            <strong className="block type-title tabular-nums text-danger">
              {item.failedChapters}
            </strong>
            <span className="type-caption text-muted">{t('crawl.detail.failed')}</span>
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
              {item.etaSeconds == null
                ? '—'
                : duration(
                    new Date(0).toISOString(),
                    new Date(item.etaSeconds * 1000).toISOString()
                  )}
            </strong>
          </Panel>
          <Panel tone="inset" padding="sm" className="text-muted">
            {t('crawl.detail.pausedTime')}
            <strong className="mt-0.5 block text-secondary">
              {duration(new Date(0).toISOString(), new Date(item.totalPausedMs).toISOString())}
            </strong>
          </Panel>
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-3 type-title-sm font-bold">{t('crawl.detail.stages')}</h2>
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
        <h2 className="mb-3 type-title-sm font-bold">{t('crawl.detail.activity')}</h2>
        <div className="max-h-72 space-y-3 overflow-y-auto type-label">
          {(events.data ?? []).map((event) => (
            <div key={event.id} className="flex gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.level === 'error' ? 'bg-danger' : event.level === 'warning' ? 'bg-warning' : event.level === 'success' ? 'bg-success' : 'bg-primary'}`}
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
          <p>{t('crawl.detail.failedNotice').replace('{count}', String(item.failedChapters))}</p>
        </Panel>
      ) : null}

      <StickyActionBar className="grid grid-cols-2 gap-2">
        {canPause ? (
          <Button
            variant="secondary"
            actionState={pause.status}
            leadingIcon={<Pause size={16} />}
            onClick={() => pause.mutate()}
          >
            {t('crawl.detail.pause')}
          </Button>
        ) : canResume ? (
          <Button
            variant="secondary"
            actionState={resume.status}
            leadingIcon={<Play size={16} />}
            onClick={() => resume.mutate()}
          >
            {t('crawl.detail.resume')}
          </Button>
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
        {active || canResume ? (
          <Button
            variant="danger"
            actionState={cancel.status}
            leadingIcon={<Square size={16} />}
            onClick={() => cancel.mutate()}
          >
            {t('crawl.detail.stop')}
          </Button>
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
