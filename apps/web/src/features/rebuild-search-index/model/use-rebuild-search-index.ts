import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchInvalidation } from '../../../entities/search';
import { rebuildSearchIndex } from '../api/rebuild-search-index';

export function useRebuildSearchIndex() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: rebuildSearchIndex,
    onSuccess: async () => {
      await searchInvalidation.invalidateAll(client);
    }
  });
}
