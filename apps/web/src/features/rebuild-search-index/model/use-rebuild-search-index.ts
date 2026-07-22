import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchInvalidation } from '../../../entities/search';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { rebuildSearchIndex } from '../api/rebuild-search-index';

export function useRebuildSearchIndex() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: rebuildSearchIndex,
    onSuccess: async (result) => {
      await searchInvalidation.invalidateAll(client);
      toast({
        kind: 'success',
        title: t('searchIndex.rebuilt'),
        description: t('searchIndex.rebuiltCount', { count: result.indexedDocuments })
      });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('searchIndex.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
