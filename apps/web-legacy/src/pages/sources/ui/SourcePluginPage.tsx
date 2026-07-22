import { useNavigate, useParams } from 'react-router-dom';
import { InstallSourcePluginForm } from '@/features/install-source-plugin';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { EmptyState, Page, PageHeader } from '@/shared/ui';
import { SourcePluginDetails } from '@/widgets/source-plugin-details';
export function SourcePluginPage({ mode = 'edit' }: { mode?: 'create' | 'edit' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pluginId } = useParams();
  if (mode === 'create')
    return (
      <Page className="max-w-3xl">
        <PageHeader
          title={t('sources.plugins.installTitle')}
          description={t('sources.plugins.installDescription')}
        />
        <InstallSourcePluginForm onInstalled={() => navigate('/sources?section=plugins')} />
      </Page>
    );
  if (!pluginId)
    return (
      <Page>
        <EmptyState title={t('sources.profile.notFound')} />
      </Page>
    );
  return (
    <Page className="max-w-4xl">
      <PageHeader title={t('sources.plugins.diagnostics')} description={pluginId} />
      <SourcePluginDetails pluginId={pluginId} />
    </Page>
  );
}
