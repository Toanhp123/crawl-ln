import { useNavigate } from 'react-router-dom';
import { InstallSourcePluginForm } from '@/features/install-source-plugin';
import { useI18n } from '@/shared/i18n';
import { Page, PageHeader, Panel } from '@/shared/ui';
import { SourcePluginStudio } from '@/widgets/source-plugin-studio';

export function SourcePluginStudioPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <Page className="max-w-[96rem]">
      <PageHeader
        eyebrow={t('pluginStudio.eyebrow')}
        title={t('pluginStudio.title')}
        description={t('pluginStudio.description')}
      />
      <SourcePluginStudio />
      <details className="group" open>
        <summary className="cursor-pointer list-none type-label text-secondary hover:text-text">
          {t('pluginStudio.importExisting')}
        </summary>
        <Panel className="mt-3 max-w-3xl">
          <InstallSourcePluginForm onInstalled={() => navigate('/sources?section=plugins')} />
        </Panel>
      </details>
    </Page>
  );
}
