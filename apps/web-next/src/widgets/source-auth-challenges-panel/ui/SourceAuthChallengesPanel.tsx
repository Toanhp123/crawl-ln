import { SourceAuthChallengeRow, useSourceAuthChallenges } from '@/entities/source-auth-challenge';
import { ResolveSourceAuthChallenge } from '@/features/resolve-source-auth-challenge';
import { useI18n } from '@/shared/i18n';
import { useConnectionStatus } from '@/shared/realtime';
import { EmptyState, ErrorBanner, LoadingState, Panel, Section } from '@/shared/ui';

export function SourceAuthChallengesPanel() {
  const { t } = useI18n();
  const connectionState = useConnectionStatus();
  const query = useSourceAuthChallenges({ connectionState, pollingIntervalMs: 5_000 });
  return (
    <Section
      title={t('sources.challenges.title')}
      description={t('sources.challenges.description')}
    >
      <ErrorBanner error={query.error} />
      {query.isLoading ? (
        <LoadingState />
      ) : !query.data?.length ? (
        <EmptyState title={t('sources.challenges.empty')} />
      ) : (
        <div className="space-y-3">
          {query.data.map((challenge) => (
            <Panel key={challenge.id} tone="default" padding="none">
              <SourceAuthChallengeRow challenge={challenge} />
              <div className="border-t border-border p-4">
                <ResolveSourceAuthChallenge challenge={challenge} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
