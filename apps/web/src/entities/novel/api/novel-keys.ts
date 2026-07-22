import type { ListNovelsOptions } from './novel-api';

export const novelKeys = {
  all: ['novels'] as const,
  lists: () => ['novels', 'list'] as const,
  list: (query: ListNovelsOptions) => ['novels', 'list', query] as const,
  detail: (id: string) => ['novels', 'detail', id] as const,
  stats: () => ['novels', 'stats'] as const
};
