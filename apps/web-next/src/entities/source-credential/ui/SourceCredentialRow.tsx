import type { ReactNode } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Badge, ListRow } from '../../../shared/ui';
import { sourceCredentialBinding } from '../model/source-credential';
import type { SourceCredential } from '../model/types';

export function SourceCredentialRow({
  credential,
  trailing
}: {
  credential: SourceCredential;
  trailing?: ReactNode;
}) {
  const { status, t } = useI18n();
  const binding = sourceCredentialBinding(credential);

  return (
    <ListRow
      title={credential.name}
      description={
        binding === credential.ownerType
          ? t(credential.ownerType === 'system' ? 'sources.common.system' : 'sources.common.user')
          : binding
      }
      meta={
        <Badge tone={credential.enabled ? 'success' : 'neutral'}>
          {status(credential.strategy)}
        </Badge>
      }
      trailing={trailing}
    />
  );
}
