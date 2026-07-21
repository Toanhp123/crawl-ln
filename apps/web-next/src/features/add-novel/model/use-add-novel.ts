import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { createAddNovelWorkflow, type AddNovelWorkflowResult } from './create-add-novel-workflow';
import { invalidateAddNovelResult } from './invalidate-add-novel-result';

const workflow = createAddNovelWorkflow();

export function useAddNovel(
  options: { onSuccess?: (result: AddNovelWorkflowResult) => void } = {}
) {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();

  return useMutation({
    mutationFn: (sourceUrl: string) => workflow.execute(sourceUrl),
    onSuccess: async (result) => {
      await invalidateAddNovelResult(client, result);
      toast({
        kind: 'info',
        title: t('addNovel.queued'),
        description: t('addNovel.queuedDescription')
      });
      options.onSuccess?.(result);
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('addNovel.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
