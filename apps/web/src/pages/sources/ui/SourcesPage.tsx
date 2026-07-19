import { Plus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, EmptyState, ErrorBanner, LoadingState, Page, PageHeader } from '@/shared/ui';
import { useSourcesPage } from '../model/useSourcesPage';
import { SourceProfileCard } from './SourceProfileCard';

export function SourcesPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const model = useSourcesPage();
  return (
    <Page className="max-w-5xl">
      <PageHeader
        title={t('nav.sources')}
        description={t('sources.description')}
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              actionState={model.reload.status}
              feedbackPolicy="immediate"
              leadingIcon={<RefreshCw size={16} />}
              onClick={() => model.reload.mutate()}
            >
              {t('sources.refresh')}
            </Button>
            <Button
              size="sm"
              leadingIcon={<Plus size={16} />}
              onClick={() => navigate('/sources/new')}
            >
              {t('sources.add')}
            </Button>
          </div>
        }
      />
      <ErrorBanner error={model.query.error} />
      {model.query.isLoading ? (
        <LoadingState />
      ) : !model.query.data?.length ? (
        <EmptyState title={t('sources.emptyTitle')} description={t('sources.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {model.query.data.map((plugin) => {
            const ownsToggle = model.toggle.variables?.id === plugin.manifest.id;
            return (
              <SourceProfileCard
                key={plugin.manifest.id}
                plugin={plugin}
                actionState={ownsToggle ? model.toggle.status : 'idle'}
                disabled={model.toggle.isPending && !ownsToggle}
                onOpen={() => navigate(`/sources/${encodeURIComponent(plugin.manifest.id)}`)}
                onToggle={(enabled) => model.toggle.mutate({ id: plugin.manifest.id, enabled })}
              />
            );
          })}
        </div>
      )}
    </Page>
  );
}
