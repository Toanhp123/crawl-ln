import type { ReactNode } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Badge, ListRow } from '../../../shared/ui';
import type { SourceAuthChallenge } from '../model/types';

export function SourceAuthChallengeRow({
  challenge,
  trailing
}: {
  challenge: SourceAuthChallenge;
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
