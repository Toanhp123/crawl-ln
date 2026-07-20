import type {
  EditableNetworkRouteType,
  NetworkProfileFormState
} from '../model/networkProfileForm';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Field, Input, SegmentedControl } from '@/shared/ui';

const routeIds: EditableNetworkRouteType[] = ['direct', 'http-proxy', 'https-proxy', 'socks-proxy'];

export function NetworkProfileForm({
  value,
  onChange,
  ownerEditable = true
}: {
  value: NetworkProfileFormState;
  onChange: (value: NetworkProfileFormState) => void;
  ownerEditable?: boolean;
}) {
  const { status, t } = useI18n();
  return (
    <div className="space-y-4">
      <Field label={t('sources.network.name')}>
        <Input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </Field>
      <Field label={t('sources.network.owner')}>
        <SegmentedControl
          value={value.ownerType}
          columns={2}
          items={[
            { id: 'user', label: t('sources.common.user') },
            { id: 'system', label: t('sources.common.system') }
          ]}
          disabled={!ownerEditable}
          onChange={(ownerType) => onChange({ ...value, ownerType })}
        />
      </Field>
      <Field label={t('sources.network.routeType')}>
        <SegmentedControl
          value={value.routeType}
          columns={4}
          items={routeIds.map((id) => ({ id, label: status(id) }))}
          onChange={(routeType) => onChange({ ...value, routeType, proxyPassword: '' })}
        />
      </Field>
      <Field label={t('sources.network.regions')} hint={t('sources.network.regionsHint')}>
        <Input
          value={value.regions}
          onChange={(event) => onChange({ ...value, regions: event.target.value })}
        />
      </Field>
      <Field label={t('sources.network.tags')} hint={t('sources.network.tagsHint')}>
        <Input
          value={value.tags}
          onChange={(event) => onChange({ ...value, tags: event.target.value })}
        />
      </Field>
      {value.routeType !== 'direct' ? (
        <>
          <Field label={t('sources.network.proxyUrl')}>
            <Input
              type="url"
              value={value.proxyUrl}
              onChange={(event) => onChange({ ...value, proxyUrl: event.target.value })}
            />
          </Field>
          <Field label={t('sources.network.proxyUsername')} hint={t('sources.common.optional')}>
            <Input
              value={value.proxyUsername}
              autoComplete="off"
              onChange={(event) => onChange({ ...value, proxyUsername: event.target.value })}
            />
          </Field>
          <Field
            label={t('sources.network.proxyPassword')}
            hint={t('sources.credentials.secretWriteOnly')}
          >
            <Input
              type="password"
              value={value.proxyPassword}
              autoComplete="new-password"
              onChange={(event) => onChange({ ...value, proxyPassword: event.target.value })}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}
