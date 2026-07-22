export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => ['tasks', 'list'] as const,
  list: () => ['tasks', 'list'] as const,
  summary: () => ['tasks', 'summary'] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
  events: (id: string) => ['tasks', 'events', id] as const,
  novel: (novelId: string) => ['tasks', 'novel', novelId] as const
};
