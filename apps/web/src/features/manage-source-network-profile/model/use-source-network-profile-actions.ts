import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourceNetworkProfileInvalidation } from '../../../entities/source-network-profile';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import {
  createSourceNetworkProfile,
  deleteSourceNetworkProfile,
  testSourceNetworkProfile,
  updateSourceNetworkProfile
} from '../api/manage-source-network-profile';
import type { NetworkProfileCreateInput, NetworkProfileUpdateInput } from './network-profile-form';
function useFeedback() {
  const { errorMessage, t } = useI18n();
  return {
    ok: (key: string) => toast({ kind: 'success', title: t(key) }),
    fail: (error: unknown) =>
      toast({
        kind: 'error',
        title: t('manageSourceNetworkProfile.failed'),
        description: errorMessage(error)
      })
  };
}
export function useCreateSourceNetworkProfile(onSuccess?: () => void, onSettled?: () => void) {
  const client = useQueryClient();
  const f = useFeedback();
  return useMutation({
    mutationFn: (input: NetworkProfileCreateInput) => createSourceNetworkProfile(input),
    onSuccess: async () => {
      f.ok('manageSourceNetworkProfile.saved');
      await sourceNetworkProfileInvalidation.invalidateAll(client);
      onSuccess?.();
    },
    onError: f.fail,
    onSettled
  });
}
export function useUpdateSourceNetworkProfile(
  profileId: string,
  onSuccess?: () => void,
  onSettled?: () => void
) {
  const client = useQueryClient();
  const f = useFeedback();
  return useMutation({
    mutationFn: (input: NetworkProfileUpdateInput) => updateSourceNetworkProfile(profileId, input),
    onSuccess: async () => {
      f.ok('manageSourceNetworkProfile.saved');
      await sourceNetworkProfileInvalidation.invalidateAll(client);
      onSuccess?.();
    },
    onError: f.fail,
    onSettled
  });
}
export function useDeleteSourceNetworkProfile(profileId: string, onSuccess?: () => void) {
  const client = useQueryClient();
  const f = useFeedback();
  return useMutation({
    mutationFn: () => deleteSourceNetworkProfile(profileId),
    onSuccess: async () => {
      f.ok('manageSourceNetworkProfile.deleted');
      await sourceNetworkProfileInvalidation.invalidateAll(client);
      onSuccess?.();
    },
    onError: f.fail
  });
}
export function useTestSourceNetworkProfile(profileId: string) {
  const client = useQueryClient();
  const f = useFeedback();
  return useMutation({
    mutationFn: () => testSourceNetworkProfile(profileId),
    onSuccess: async () => {
      f.ok('manageSourceNetworkProfile.testDone');
      await sourceNetworkProfileInvalidation.invalidateAll(client);
    },
    onError: f.fail
  });
}
