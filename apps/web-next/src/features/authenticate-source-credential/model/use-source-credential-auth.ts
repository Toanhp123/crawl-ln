import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourceAuthChallengeInvalidation } from '../../../entities/source-auth-challenge';
import { sourceCredentialInvalidation } from '../../../entities/source-credential';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import {
  loginSourceCredential,
  logoutSourceCredential,
  testSourceCredential,
  type CredentialAuthenticationInput
} from '../api/authenticate-source-credential';

export function useSourceCredentialAuth(credentialId: string) {
  const client = useQueryClient();
  const { t } = useI18n();
  const invalidate = () =>
    Promise.all([
      sourceCredentialInvalidation.invalidateAll(client),
      sourceAuthChallengeInvalidation.invalidateAll(client)
    ]);
  const failure = (error: unknown) =>
    toast({
      kind: 'error',
      title: t('authenticateSourceCredential.failed'),
      description: getPublicErrorDescription(error)
    });
  const login = useMutation({
    mutationFn: (input: CredentialAuthenticationInput) =>
      loginSourceCredential(credentialId, input),
    onSuccess: async () => {
      toast({ kind: 'success', title: t('authenticateSourceCredential.loginDone') });
      await invalidate();
    },
    onError: failure
  });
  const logout = useMutation({
    mutationFn: () => logoutSourceCredential(credentialId),
    onSuccess: async () => {
      toast({ kind: 'success', title: t('authenticateSourceCredential.logoutDone') });
      await invalidate();
    },
    onError: failure
  });
  const test = useMutation({
    mutationFn: (input: CredentialAuthenticationInput) => testSourceCredential(credentialId, input),
    onSuccess: async () => {
      toast({ kind: 'success', title: t('authenticateSourceCredential.testDone') });
      await invalidate();
    },
    onError: failure
  });
  return { login, logout, test };
}
