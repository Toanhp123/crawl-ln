import type { SourceReaderAuthChallengeResponse } from '@novel-tool/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourceAuthChallengeInvalidation } from '../../../entities/source-auth-challenge';
import { sourceCredentialInvalidation } from '../../../entities/source-credential';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import {
  cancelSourceAuthChallenge,
  respondSourceAuthChallenge
} from '../api/resolve-source-auth-challenge';
export function useResolveSourceAuthChallenge(challengeId: string, clearSecret?: () => void) {
  const client = useQueryClient();
  const { t } = useI18n();
  const invalidate = () =>
    Promise.all([
      sourceAuthChallengeInvalidation.invalidateAll(client),
      sourceCredentialInvalidation.invalidateAll(client)
    ]);
  const fail = (error: unknown) =>
    toast({
      kind: 'error',
      title: t('resolveSourceAuthChallenge.failed'),
      description: getPublicErrorDescription(error)
    });
  const respond = useMutation({
    mutationFn: (response: SourceReaderAuthChallengeResponse) =>
      respondSourceAuthChallenge(challengeId, response),
    onSuccess: async () => {
      toast({ kind: 'success', title: t('resolveSourceAuthChallenge.resolved') });
      await invalidate();
    },
    onError: fail,
    onSettled: clearSecret
  });
  const cancel = useMutation({
    mutationFn: () => cancelSourceAuthChallenge(challengeId),
    onSuccess: async () => {
      toast({ kind: 'success', title: t('resolveSourceAuthChallenge.cancelled') });
      await invalidate();
    },
    onError: fail,
    onSettled: clearSecret
  });
  return { respond, cancel };
}
