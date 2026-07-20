import { KeyRound, Network, Plus, RefreshCw, ShieldQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/shared/i18n/I18nProvider';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Page,
  PageHeader,
  Panel,
  Text
} from '@/shared/ui';
import { useSourcesPage } from '../model/useSourcesPage';
import { SourceProfileCard } from './SourceProfileCard';

export function SourcesPage() {
  const navigate = useNavigate();
  const { t, number } = useI18n();
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
              actionState={model.refresh.status}
              feedbackPolicy="immediate"
              leadingIcon={<RefreshCw size={16} />}
              onClick={() => model.refresh.mutate()}
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
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Panel tone="inset" padding="sm" className="text-center">
          <KeyRound size={16} className="mx-auto mb-1" />
          <Text variant="label">{number(model.credentials.data?.length ?? 0)}</Text>
          <Text variant="caption" tone="muted">
            {t('sources.credentials')}
          </Text>
        </Panel>
        <Panel tone="inset" padding="sm" className="text-center">
          <Network size={16} className="mx-auto mb-1" />
          <Text variant="label">{number(model.networkProfiles.data?.length ?? 0)}</Text>
          <Text variant="caption" tone="muted">
            {t('sources.networkProfiles')}
          </Text>
        </Panel>
        <Panel tone="inset" padding="sm" className="text-center">
          <ShieldQuestion size={16} className="mx-auto mb-1" />
          <Text variant="label">{number(model.challenges.data?.length ?? 0)}</Text>
          <Text variant="caption" tone="muted">
            {t('sources.authChallenges')}
          </Text>
        </Panel>
      </div>
      <ErrorBanner error={model.query.error} />
      {model.query.isLoading ? (
        <LoadingState />
      ) : !model.query.data?.length ? (
        <EmptyState title={t('sources.emptyTitle')} description={t('sources.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {model.query.data.map((plugin) => {
            const ownsToggle = model.toggle.variables?.plugin.id === plugin.id;
            return (
              <SourceProfileCard
                key={plugin.id}
                plugin={plugin}
                actionState={ownsToggle ? model.toggle.status : 'idle'}
                disabled={model.toggle.isPending && !ownsToggle}
                onOpen={() => navigate(`/sources/${encodeURIComponent(plugin.id)}`)}
                onToggle={(enabled) => model.toggle.mutate({ plugin, enabled })}
              />
            );
          })}
        </div>
      )}
    </Page>
  );
}
