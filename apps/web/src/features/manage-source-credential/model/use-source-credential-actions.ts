import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourceCredentialInvalidation } from '../../../entities/source-credential';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import {
  createSourceCredential,
  deleteSourceCredential,
  updateSourceCredentialSecret
} from '../api/manage-source-credential';
import type { CredentialCreateInput } from './credential-form';

function useCredentialFeedback() {
  const { errorMessage, t } = useI18n();
  return {
    success(key: string) {
      toast({ kind: 'success', title: t(key) });
    },
    failure(error: unknown) {
      toast({
        kind: 'error',
        title: t('manageSourceCredential.failed'),
        description: errorMessage(error)
      });
    }
  };
}

export function useCreateSourceCredential(onSuccess?: () => void, onSettled?: () => void) {
  const client = useQueryClient();
  const feedback = useCredentialFeedback();
  return useMutation({
    mutationFn: (input: CredentialCreateInput) => createSourceCredential(input),
    onSuccess: async () => {
      feedback.success('manageSourceCredential.created');
      await sourceCredentialInvalidation.invalidateAll(client);
      onSuccess?.();
    },
    onError: feedback.failure,
    onSettled
  });
}
export function useUpdateSourceCredentialSecret(
  credentialId: string,
  onSuccess?: () => void,
  onSettled?: () => void
) {
  const client = useQueryClient();
  const feedback = useCredentialFeedback();
  return useMutation({
    mutationFn: (secret: Record<string, unknown>) =>
      updateSourceCredentialSecret(credentialId, secret),
    onSuccess: async () => {
      feedback.success('manageSourceCredential.updated');
      await sourceCredentialInvalidation.invalidateAll(client);
      onSuccess?.();
    },
    onError: feedback.failure,
    onSettled
  });
}
export function useDeleteSourceCredential(credentialId: string, onSuccess?: () => void) {
  const client = useQueryClient();
  const feedback = useCredentialFeedback();
  return useMutation({
    mutationFn: () => deleteSourceCredential(credentialId),
    onSuccess: async () => {
      feedback.success('manageSourceCredential.deleted');
      await sourceCredentialInvalidation.invalidateAll(client);
      onSuccess?.();
    },
    onError: feedback.failure
  });
}
