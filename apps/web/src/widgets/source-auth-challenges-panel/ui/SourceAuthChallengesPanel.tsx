import {
  SourceAuthChallengeRow,
  useSourceAuthChallengesQuery
} from '@/entities/source-auth-challenge';
import { ResolveSourceAuthChallenge } from '@/features/resolve-source-auth-challenge';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { EmptyState, ErrorBanner, LoadingState, Panel, Section, Text } from '@/shared/ui';
export function SourceAuthChallengesPanel() {
  const { t, relativeTime } = useI18n();
  const query = useSourceAuthChallengesQuery(true);
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
                <Text as="p" variant="caption" tone="muted" className="mb-3">
                  {t('sources.challenges.expires', { value: relativeTime(challenge.expiresAt) })}
                </Text>
                <ResolveSourceAuthChallenge challenge={challenge} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
