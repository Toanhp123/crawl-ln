import { useI18n } from '../../../shared/i18n';
import { Field, FilterChip, Input, SegmentedControl } from '../../../shared/ui';
import type { NetworkProfileFormState, NetworkRouteType } from '../model/network-profile-form';
const routes: NetworkRouteType[] = ['direct', 'http-proxy', 'https-proxy', 'socks-proxy'];
export function NetworkProfileForm({
  value,
  onChange,
  ownerEditable = true
}: {
  value: NetworkProfileFormState;
  onChange: (value: NetworkProfileFormState) => void;
  ownerEditable?: boolean;
}) {
  const { t, status } = useI18n();
  return (
    <div className="space-y-3">
      <Field label={t('manageSourceNetworkProfile.name')}>
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </Field>
      {ownerEditable ? (
        <SegmentedControl
          value={value.ownerType}
          columns={2}
          items={[
            { id: 'user', label: t('manageSourceNetworkProfile.user') },
            { id: 'system', label: t('manageSourceNetworkProfile.system') }
          ]}
          onChange={(ownerType) => onChange({ ...value, ownerType })}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {routes.map((routeType) => (
          <FilterChip
            key={routeType}
            selected={value.routeType === routeType}
            onClick={() => onChange({ ...value, routeType, proxyPassword: '' })}
          >
            {status(routeType)}
          </FilterChip>
        ))}
      </div>
      <Field label={t('manageSourceNetworkProfile.regions')}>
        <Input
          value={value.regions}
          onChange={(e) => onChange({ ...value, regions: e.target.value })}
        />
      </Field>
      <Field label={t('manageSourceNetworkProfile.tags')}>
        <Input value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} />
      </Field>
      {value.routeType !== 'direct' ? (
        <>
          <Field label={t('manageSourceNetworkProfile.proxyUrl')}>
            <Input
              type="url"
              value={value.proxyUrl}
              onChange={(e) => onChange({ ...value, proxyUrl: e.target.value })}
            />
          </Field>
          <Field label={t('manageSourceNetworkProfile.proxyUsername')}>
            <Input
              autoComplete="off"
              value={value.proxyUsername}
              onChange={(e) => onChange({ ...value, proxyUsername: e.target.value })}
            />
          </Field>
          <Field label={t('manageSourceNetworkProfile.proxyPassword')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={value.proxyPassword}
              onChange={(e) => onChange({ ...value, proxyPassword: e.target.value })}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}
