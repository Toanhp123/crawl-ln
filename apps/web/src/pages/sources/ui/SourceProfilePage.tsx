import { ChevronDown, Plug } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Page,
  PageHeader,
  Panel,
  Text
} from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { useSourcesPage } from '../model/useSourcesPage';

export function SourceProfilePage({ mode = 'edit' }: { mode?: 'create' | 'edit' }) {
  const { t, status } = useI18n();
  const { profileId } = useParams();
  const model = useSourcesPage();
  const plugin = model.query.data?.find((item) => item.id === profileId);
  if (model.query.isLoading)
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  if (model.query.error)
    return (
      <Page>
        <ErrorBanner error={model.query.error} />
      </Page>
    );
  if (mode === 'create')
    return (
      <Page>
        <PageHeader title={t('sources.profile.createTitle')} />
        <EmptyState
          icon={<Plug />}
          title={t('sources.profile.createUnsupportedTitle')}
          description={t('sources.profile.createUnsupportedDescription')}
        />
      </Page>
    );
  if (!plugin)
    return (
      <Page>
        <EmptyState title={t('sources.profile.notFound')} />
      </Page>
    );
  return (
    <Page className="max-w-3xl">
      <PageHeader title={plugin.name} description={plugin.domains.join(', ')} />
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <Text variant="title">{t('sources.profile.basic')}</Text>
          <Badge tone={plugin.status === 'active' ? 'success' : 'warning'}>
            {status(plugin.status)}
          </Badge>
        </div>
        <Panel tone="inset" padding="lg" className="space-y-2">
          <Text variant="supporting">
            {t('sources.profile.version')}: {plugin.activeVersion ?? '—'}
          </Text>
          <Text variant="supporting">
            {t('sources.trust')}: {plugin.trustLevel}
          </Text>
          <Text variant="supporting">
            {t('sources.profile.capabilities')}: {plugin.capabilities.join(', ')}
          </Text>
        </Panel>
      </Card>
      <Card className="mt-3">
        <details>
          <summary className="flex cursor-pointer items-center justify-between">
            <Text variant="title">{t('sources.profile.advanced')}</Text>
            <ChevronDown size={18} />
          </summary>
          <div className="mt-4 space-y-2">
            <Text variant="supporting" tone="muted">
              {t('sources.profile.advancedDescription')}
            </Text>
            <Text variant="supporting">
              {t('sources.health')}: {plugin.health?.status ?? t('sources.healthUnknown')}
            </Text>
            <Text variant="supporting">
              {t('sources.permissions')}:{' '}
              {plugin.permissionsPending
                ? t('sources.permissionsPending')
                : t('sources.permissionsApproved')}
            </Text>
          </div>
        </details>
      </Card>
    </Page>
  );
}
