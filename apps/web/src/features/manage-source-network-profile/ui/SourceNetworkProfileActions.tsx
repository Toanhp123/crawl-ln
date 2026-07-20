import type { SourceReaderNetworkProfileMetadata } from '@novel-tool/shared';
import { Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteSourceNetworkProfile,
  testSourceNetworkProfile,
  updateSourceNetworkProfile
} from '@/entities/source-network-profile';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, ConfirmDialog, Switch, toast } from '@/shared/ui';
import { EditSourceNetworkProfileButton } from './EditSourceNetworkProfileButton';

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
  const failure = (error: unknown) =>
    toast({
      kind: 'error',
      title: t('sources.network.saveFailed'),
      description: errorMessage(error)
    });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateSourceNetworkProfile(profile.id, { enabled }),
    onSuccess: refresh,
    onError: failure
  });
  const test = useMutation({
    mutationFn: () => testSourceNetworkProfile(profile.id),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.testCompleted') });
      refresh();
    },
    onError: failure
  });
  const remove = useMutation({
    mutationFn: () => deleteSourceNetworkProfile(profile.id),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.network.deleted') });
      setConfirmOpen(false);
      refresh();
    },
    onError: failure
  });
  const legacy = profile.routeType === 'vpn-gateway';
  return (
    <div className="space-y-2">
      <Switch
        checked={profile.enabled}
        label={t(profile.enabled ? 'sources.common.enabled' : 'sources.common.disabled')}
        actionState={toggle.status}
        disabled={legacy}
        onCheckedChange={(enabled) => toggle.mutate(enabled)}
      />
      <div className="flex flex-wrap gap-2">
        <EditSourceNetworkProfileButton profile={profile} />
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Wifi size={16} />}
          actionState={test.status}
          disabled={legacy}
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
