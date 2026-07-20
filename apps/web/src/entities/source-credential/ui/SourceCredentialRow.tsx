import type { SourceReaderCredentialMetadata } from '@novel-tool/shared';
import type { ReactNode } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Badge, ListRow } from '@/shared/ui';
import { sourceCredentialBinding } from '../model/sourceCredential';

export function SourceCredentialRow({
  credential,
  trailing
}: {
  credential: SourceReaderCredentialMetadata;
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
