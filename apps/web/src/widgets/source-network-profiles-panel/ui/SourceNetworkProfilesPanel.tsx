import {
  SourceNetworkProfileRow,
  useSourceNetworkProfilesQuery
} from '@/entities/source-network-profile';
import {
  CreateSourceNetworkProfileButton,
  SourceNetworkProfileActions
} from '@/features/manage-source-network-profile';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { EmptyState, ErrorBanner, LoadingState, Panel, Section } from '@/shared/ui';
export function SourceNetworkProfilesPanel() {
  const { t } = useI18n();
  const query = useSourceNetworkProfilesQuery();
  return (
    <Section
      title={t('sources.network.title')}
      description={t('sources.network.description')}
      action={<CreateSourceNetworkProfileButton />}
    >
      <ErrorBanner error={query.error} />
      {query.isLoading ? (
        <LoadingState />
      ) : !query.data?.length ? (
        <EmptyState title={t('sources.network.empty')} />
      ) : (
        <Panel padding="none" tone="default">
          {query.data.map((profile) => (
            <SourceNetworkProfileRow
              key={profile.id}
              profile={profile}
              trailing={
                <div className="w-full max-w-sm">
                  <SourceNetworkProfileActions profile={profile} />
                </div>
              }
            />
          ))}
        </Panel>
      )}
    </Section>
  );
}
