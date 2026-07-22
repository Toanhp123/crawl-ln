import { Plus, Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';
import type { SourceNetworkProfile } from '../../../entities/source-network-profile';
import { useI18n } from '../../../shared/i18n';
import { Button, ConfirmDialog, Drawer, Switch } from '../../../shared/ui';
import {
  buildNetworkProfileCreate,
  buildNetworkProfileUpdate,
  canSubmitNetworkProfile,
  clearNetworkProfileSecret,
  createEmptyNetworkProfileForm,
  networkProfileFormFromProfile
} from '../model/network-profile-form';
import {
  useCreateSourceNetworkProfile,
  useDeleteSourceNetworkProfile,
  useTestSourceNetworkProfile,
  useUpdateSourceNetworkProfile
} from '../model/use-source-network-profile-actions';
import { NetworkProfileForm } from './NetworkProfileForm';
export function CreateSourceNetworkProfileButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(createEmptyNetworkProfileForm);
  const reset = () => setForm(createEmptyNetworkProfileForm());
  const action = useCreateSourceNetworkProfile(
    () => {
      setOpen(false);
      reset();
    },
    () => setForm((current) => clearNetworkProfileSecret(current))
  );
  return (
    <>
      <Button leadingIcon={<Plus size={17} />} onClick={() => setOpen(true)}>
        {t('manageSourceNetworkProfile.create')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title={t('manageSourceNetworkProfile.createTitle')}
      >
        <div className="space-y-4">
          <NetworkProfileForm value={form} onChange={setForm} />
          <Button
            full
            actionState={action.status}
            disabled={!canSubmitNetworkProfile(form)}
            onClick={() => action.mutate(buildNetworkProfileCreate(form))}
          >
            {t('manageSourceNetworkProfile.save')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}
export function SourceNetworkProfileActions({ profile }: { profile: SourceNetworkProfile }) {
  const { t } = useI18n();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState(() => networkProfileFormFromProfile(profile));
  const reset = () => setForm(networkProfileFormFromProfile(profile));
  const update = useUpdateSourceNetworkProfile(
    profile.id,
    () => setEditOpen(false),
    () => setForm((current) => clearNetworkProfileSecret(current))
  );
  const remove = useDeleteSourceNetworkProfile(profile.id, () => setDeleteOpen(false));
  const test = useTestSourceNetworkProfile(profile.id);
  const toggle = useUpdateSourceNetworkProfile(profile.id);
  const legacy = profile.routeType === 'vpn-gateway';
  return (
    <div className="space-y-2">
      <Switch
        checked={profile.enabled}
        label={t('manageSourceNetworkProfile.enabled')}
        disabled={legacy}
        actionState={toggle.status}
        onCheckedChange={(enabled) => toggle.mutate({ enabled })}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            reset();
            setEditOpen(true);
          }}
          disabled={legacy}
        >
          {t('manageSourceNetworkProfile.edit')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Wifi size={16} />}
          actionState={test.status}
          disabled={legacy}
          onClick={() => test.mutate()}
        >
          {t('manageSourceNetworkProfile.test')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          leadingIcon={<Trash2 size={16} />}
          onClick={() => setDeleteOpen(true)}
        >
          {t('manageSourceNetworkProfile.delete')}
        </Button>
      </div>
      <Drawer
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) reset();
        }}
        title={t('manageSourceNetworkProfile.editTitle')}
      >
        <div className="space-y-4">
          <NetworkProfileForm value={form} onChange={setForm} ownerEditable={false} />
          <Button
            full
            actionState={update.status}
            disabled={!canSubmitNetworkProfile(form, profile.routeType)}
            onClick={() => update.mutate(buildNetworkProfileUpdate(form, profile.routeType))}
          >
            {t('manageSourceNetworkProfile.save')}
          </Button>
        </div>
      </Drawer>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('manageSourceNetworkProfile.deleteTitle')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
