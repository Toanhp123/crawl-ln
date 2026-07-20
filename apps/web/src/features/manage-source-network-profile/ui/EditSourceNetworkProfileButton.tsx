import type { SourceReaderNetworkProfileMetadata } from '@novel-tool/shared';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSourceNetworkProfile } from '@/entities/source-network-profile';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, Drawer, InlineNotice, toast } from '@/shared/ui';
import {
  buildNetworkProfileUpdate,
  canSubmitNetworkProfile,
  networkProfileFormFromProfile
} from '../model/networkProfileForm';
import { NetworkProfileForm } from './NetworkProfileForm';

export function EditSourceNetworkProfileButton({
  profile
}: {
  profile: SourceReaderNetworkProfileMetadata;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const editable = profile.routeType !== 'vpn-gateway';
  const [form, setForm] = useState(() => networkProfileFormFromProfile(profile));
  const reset = () => setForm(networkProfileFormFromProfile(profile));
  const mutation = useMutation({
    mutationFn: () =>
      updateSourceNetworkProfile(profile.id, buildNetworkProfileUpdate(form, profile.routeType)),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.saved') });
      setOpen(false);
      reset();
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
  const openEditor = () => {
    reset();
    setOpen(true);
  };
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Pencil size={16} />}
        disabled={!editable}
        onClick={openEditor}
      >
        {t('sources.network.edit')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          reset();
          setOpen(next);
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
