import type { SourceReaderAuthChallenge } from '@novel-tool/shared';
import type { ReactNode } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Badge, ListRow } from '@/shared/ui';

export function SourceAuthChallengeRow({
  challenge,
  trailing
}: {
  challenge: SourceReaderAuthChallenge;
  trailing?: ReactNode;
}) {
  const { relativeTime, status, t } = useI18n();
  return (
    <ListRow
      title={`${challenge.pluginId} · ${status(challenge.type)}`}
      description={t('sources.challenges.expires', { value: relativeTime(challenge.expiresAt) })}
      meta={
        <Badge tone={challenge.status === 'pending' ? 'warning' : 'neutral'}>
          {status(challenge.status)}
        </Badge>
      }
      trailing={trailing}
    />
  );
}
