import type { ReactNode } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Badge, ListRow } from '../../../shared/ui';
import { sourceNetworkTone } from '../model/source-network-profile';
import type { SourceNetworkProfile } from '../model/types';

export function SourceNetworkProfileRow({
  profile,
  trailing
}: {
  profile: SourceNetworkProfile;
  trailing?: ReactNode;
}) {
  const { status, t } = useI18n();
  const scope =
    profile.regions.join(', ') ||
    t(profile.ownerType === 'system' ? 'sources.common.system' : 'sources.common.user');

  return (
    <ListRow
      title={profile.name}
      description={`${status(profile.routeType)} · ${scope}`}
      meta={
        <Badge tone={sourceNetworkTone(profile.healthStatus)}>{status(profile.healthStatus)}</Badge>
      }
      trailing={trailing}
    />
  );
}
