import { useI18n } from '@/shared/i18n';
import { FilterChip, Page, PageHeader, Panel } from '@/shared/ui';
import { SourceAuthChallengesPanel } from '@/widgets/source-auth-challenges-panel';
import { SourceCredentialsPanel } from '@/widgets/source-credentials-panel';
import { SourceInspector } from '@/widgets/source-inspector';
import { SourceNetworkProfilesPanel } from '@/widgets/source-network-profiles-panel';
import { SourceReaderOverview } from '@/widgets/source-reader-overview';
import { type SourcesSection, useSourcesPage } from '../model/useSourcesPage';

export function SourcesPage() {
  const { t } = useI18n();
  const model = useSourcesPage();
  const items: Array<{ id: SourcesSection; label: string }> = [
    { id: 'plugins', label: t('sources.section.plugins') },
    { id: 'credentials', label: t('sources.section.credentials') },
    { id: 'network', label: t('sources.section.network') },
    { id: 'challenges', label: t('sources.section.challenges') },
    { id: 'inspector', label: t('sources.section.inspector') }
  ];

  return (
    <Page className="max-w-6xl">
      <PageHeader title={t('nav.sources')} description={t('sources.console.description')} />
      <Panel tone="inset" padding="none" className="overflow-hidden">
        <div className="no-scrollbar overflow-x-auto p-[var(--panel-padding-sm)]">
          <div className="flex min-w-max gap-2" role="navigation" aria-label={t('nav.sources')}>
            {items.map((item) => (
              <FilterChip
                key={item.id}
                selected={model.section === item.id}
                onClick={() => model.setSection(item.id)}
              >
                {item.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </Panel>
      {model.section === 'plugins' ? <SourceReaderOverview /> : null}
      {model.section === 'credentials' ? <SourceCredentialsPanel /> : null}
      {model.section === 'network' ? <SourceNetworkProfilesPanel /> : null}
      {model.section === 'challenges' ? <SourceAuthChallengesPanel /> : null}
      {model.section === 'inspector' ? <SourceInspector /> : null}
    </Page>
  );
}
