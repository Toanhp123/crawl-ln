import type { LibrarySearchInput } from './search-api';

function normalize(input: LibrarySearchInput): LibrarySearchInput {
  return {
    q: input.q.trim(),
    type: input.type,
    ...(input.novelId ? { novelId: input.novelId } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.offset !== undefined ? { offset: input.offset } : {})
  };
}

export const searchKeys = {
  all: ['search'] as const,
  status: () => ['search', 'status'] as const,
  resultsRoot: () => ['search', 'results'] as const,
  results: (input: LibrarySearchInput) => ['search', 'results', normalize(input)] as const
};
