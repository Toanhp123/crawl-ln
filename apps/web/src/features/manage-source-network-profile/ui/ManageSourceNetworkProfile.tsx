import type { SourceReaderNetworkProfileMetadata, SourceReaderOwnerType } from '@novel-tool/shared';
import { Pencil, Plus, Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSourceNetworkProfile,
  deleteSourceNetworkProfile,
  testSourceNetworkProfile,
  updateSourceNetworkProfile
} from '@/entities/source-network-profile';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import {
  buildNetworkProfileCreate,
  buildNetworkProfileUpdate,
  canSubmitNetworkProfile,
  createEmptyNetworkProfileForm,
  type EditableNetworkRouteType,
  type NetworkProfileFormState
} from '../model/networkProfileForm';
import {
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  InlineNotice,
  Input,
  SegmentedControl,
  Switch,
  toast
} from '@/shared/ui';

const routeIds: EditableNetworkRouteType[] = ['direct', 'http-proxy', 'https-proxy', 'socks-proxy'];
function NetworkProfileForm({
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
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
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
          onChange={(e) => onChange({ ...value, regions: e.target.value })}
        />
      </Field>
      <Field label={t('sources.network.tags')} hint={t('sources.network.tagsHint')}>
        <Input value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} />
      </Field>
      {value.routeType !== 'direct' ? (
        <>
          <Field label={t('sources.network.proxyUrl')}>
            <Input
              type="url"
              value={value.proxyUrl}
              onChange={(e) => onChange({ ...value, proxyUrl: e.target.value })}
            />
          </Field>
          <Field label={t('sources.network.proxyUsername')} hint={t('sources.common.optional')}>
            <Input
              value={value.proxyUsername}
              autoComplete="off"
              onChange={(e) => onChange({ ...value, proxyUsername: e.target.value })}
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
              onChange={(e) => onChange({ ...value, proxyPassword: e.target.value })}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}

export function CreateSourceNetworkProfileButton() {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(createEmptyNetworkProfileForm);
  const mutation = useMutation({
    mutationFn: () => createSourceNetworkProfile(buildNetworkProfileCreate(form)),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.saved') });
      setOpen(false);
      setForm(createEmptyNetworkProfileForm());
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.networkProfiles() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.network.saveFailed'),
        description: errorMessage(error)
      }),
    onSettled: () => setForm((current) => ({ ...current, proxyPassword: '' }))
  });
  return (
    <>
      <Button leadingIcon={<Plus size={17} />} onClick={() => setOpen(true)}>
        {t('sources.network.create')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setForm(createEmptyNetworkProfileForm());
        }}
        title={t('sources.network.createTitle')}
      >
        <div className="space-y-4">
          <NetworkProfileForm value={form} onChange={setForm} />
          <Button
            full
            actionState={mutation.status}
            disabled={!canSubmitNetworkProfile(form)}
            onClick={() => mutation.mutate()}
          >
            {t('sources.common.create')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}

export function EditSourceNetworkProfileButton({
  profile
}: {
  profile: SourceReaderNetworkProfileMetadata;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const editable = profile.routeType !== 'vpn-gateway';
  const [form, setForm] = useState<NetworkProfileFormState>({
    name: profile.name,
    ownerType: profile.ownerType,
    routeType: profile.routeType === 'vpn-gateway' ? 'direct' : profile.routeType,
    regions: profile.regions.join(', '),
    tags: profile.tags.join(', '),
    proxyUrl: '',
    proxyUsername: '',
    proxyPassword: ''
  });
  const mutation = useMutation({
    mutationFn: () =>
      updateSourceNetworkProfile(profile.id, buildNetworkProfileUpdate(form, profile.routeType)),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.saved') });
      setOpen(false);
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.networkProfiles() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.network.saveFailed'),
        description: errorMessage(error)
      }),
    onSettled: () => setForm((current) => ({ ...current, proxyPassword: '' }))
  });
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Pencil size={16} />}
        disabled={!editable}
        onClick={() => setOpen(true)}
      >
        {t('sources.network.edit')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setForm((current) => ({ ...current, proxyPassword: '' }));
        }}
        title={t('sources.network.editTitle')}
      >
        {!editable ? (
          <InlineNotice>{t('sources.network.legacyVpn')}</InlineNotice>
        ) : (
          <div className="space-y-4">
            <NetworkProfileForm value={form} onChange={setForm} ownerEditable={false} />
            <Button
              full
              actionState={mutation.status}
              disabled={!canSubmitNetworkProfile(form, profile.routeType)}
              onClick={() => mutation.mutate()}
            >
              {t('sources.common.save')}
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}

export function SourceNetworkProfileActions({
  profile
}: {
  profile: SourceReaderNetworkProfileMetadata;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const refresh = () =>
    void client.invalidateQueries({ queryKey: queryKeys.sourceReader.networkProfiles() });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateSourceNetworkProfile(profile.id, { enabled }),
    onSuccess: refresh,
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.network.saveFailed'),
        description: errorMessage(error)
      })
  });
  const test = useMutation({
    mutationFn: () => testSourceNetworkProfile(profile.id),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.testCompleted') });
      refresh();
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.network.saveFailed'),
        description: errorMessage(error)
      })
  });
  const remove = useMutation({
    mutationFn: () => deleteSourceNetworkProfile(profile.id),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.deleted') });
      setConfirmOpen(false);
      refresh();
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.network.saveFailed'),
        description: errorMessage(error)
      })
  });
  return (
    <div className="space-y-2">
      <Switch
        checked={profile.enabled}
        label={t(profile.enabled ? 'sources.common.enabled' : 'sources.common.disabled')}
        actionState={toggle.status}
        disabled={profile.routeType === 'vpn-gateway'}
        onCheckedChange={(enabled) => toggle.mutate(enabled)}
      />
      <div className="flex flex-wrap gap-2">
        <EditSourceNetworkProfileButton profile={profile} />
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Wifi size={16} />}
          actionState={test.status}
          disabled={profile.routeType === 'vpn-gateway'}
          onClick={() => test.mutate()}
        >
          {t('sources.network.test')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          leadingIcon={<Trash2 size={16} />}
          onClick={() => setConfirmOpen(true)}
        >
          {t('sources.plugins.remove')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('sources.network.deleteTitle')}
        description={t('sources.network.deleteDescription')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
