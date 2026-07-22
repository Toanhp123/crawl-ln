import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSourceNetworkProfile } from '@/entities/source-network-profile';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, Drawer, toast } from '@/shared/ui';
import {
  buildNetworkProfileCreate,
  canSubmitNetworkProfile,
  createEmptyNetworkProfileForm
} from '../model/networkProfileForm';
import { NetworkProfileForm } from './NetworkProfileForm';

export function CreateSourceNetworkProfileButton() {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(createEmptyNetworkProfileForm);
  const reset = () => setForm(createEmptyNetworkProfileForm());
  const mutation = useMutation({
    mutationFn: () => createSourceNetworkProfile(buildNetworkProfileCreate(form)),
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
  return (
    <>
      <Button leadingIcon={<Plus size={17} />} onClick={() => setOpen(true)}>
        {t('sources.network.create')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
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
