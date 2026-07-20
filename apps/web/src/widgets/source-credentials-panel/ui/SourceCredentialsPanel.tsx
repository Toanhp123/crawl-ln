import { SourceCredentialRow, useSourceCredentialsQuery } from '@/entities/source-credential';
import { useSourceNetworkProfilesQuery } from '@/entities/source-network-profile';
import { SourceCredentialAuthActions } from '@/features/authenticate-source-credential';
import {
  CreateSourceCredentialButton,
  DeleteSourceCredentialButton,
  ReplaceSourceCredentialSecretButton
} from '@/features/manage-source-credential';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { EmptyState, ErrorBanner, LoadingState, Panel, Section } from '@/shared/ui';
export function SourceCredentialsPanel() {
  const { t } = useI18n();
  const credentials = useSourceCredentialsQuery();
  const profiles = useSourceNetworkProfilesQuery();
  return (
    <Section
      title={t('sources.credentials.title')}
      description={t('sources.credentials.description')}
      action={<CreateSourceCredentialButton />}
    >
      <ErrorBanner error={credentials.error} />
      {credentials.isLoading ? (
        <LoadingState />
      ) : !credentials.data?.length ? (
        <EmptyState title={t('sources.credentials.empty')} />
      ) : (
        <Panel padding="none" tone="default">
          {credentials.data.map((credential) => (
            <SourceCredentialRow
              key={credential.id}
              credential={credential}
              trailing={
                <div className="flex flex-wrap justify-end gap-2">
                  <SourceCredentialAuthActions
                    credential={credential}
                    profiles={profiles.data ?? []}
                  />
                  <ReplaceSourceCredentialSecretButton credential={credential} />
                  <DeleteSourceCredentialButton credentialId={credential.id} />
                </div>
              }
            />
          ))}
        </Panel>
      )}
    </Section>
  );
}
