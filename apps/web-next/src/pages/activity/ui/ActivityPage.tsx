import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { EmptyState, ErrorBanner, LoadingState, Page, PageHeader, Section } from '@/shared/ui';
import { CrawlTaskCard } from '@/widgets/crawl-task-card';
import { useActivityPage } from '../model/use-activity-page';

export function ActivityPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const model = useActivityPage();
  const render = (tasks: typeof model.running) => (
    <div className="space-y-2">
      {tasks.map((task) => (
        <CrawlTaskCard
          key={task.id}
          task={task}
          onOpen={() => navigate(`/activity/${encodeURIComponent(task.id)}`)}
        />
      ))}
    </div>
  );

  return (
    <Page className="max-w-5xl">
      <PageHeader title={t('nav.activity')} description={t('activity.description')} />
      <ErrorBanner error={model.tasks.error} />
      {model.tasks.isLoading ? (
        <LoadingState />
      ) : (
        <>
          {model.running.length ? (
            <Section title={t('activity.running')}>{render(model.running)}</Section>
          ) : null}
          {model.queued.length ? (
            <Section title={t('activity.queued')}>{render(model.queued)}</Section>
          ) : null}
          {model.recent.length ? (
            <Section title={t('activity.recent')}>{render(model.recent)}</Section>
          ) : null}
          {!model.running.length && !model.queued.length && !model.recent.length ? (
            <EmptyState
              title={t('activity.emptyTitle')}
              description={t('activity.emptyDescription')}
            />
          ) : null}
        </>
      )}
    </Page>
  );
}
