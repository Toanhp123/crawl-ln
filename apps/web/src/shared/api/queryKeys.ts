export const queryKeys = {
  novelsRoot: ['novels'] as const,
  novels: (options: Readonly<Record<string, unknown>> = {}) => ['novels', 'list', options] as const,
  novel: (id: string | null) => ['novels', 'detail', id] as const,
  novelTask: (id: string | null) => ['novels', 'task', id] as const,
  novelStats: ['novels', 'stats'] as const,
  tasks: ['tasks', 'list'] as const,
  taskSummary: ['tasks', 'summary'] as const,
  task: (id: string | null) => ['tasks', 'detail', id] as const,
  taskEvents: (id: string | null) => ['tasks', 'events', id] as const,
  chapter: (novelId: string | null, chapterIndex?: number) =>
    ['chapters', novelId, chapterIndex] as const,
  search: (query: string, type: string, offset: number) => ['search', query, type, offset] as const,
  sourcePlugins: ['plugins', 'sources'] as const,
  novelUpdateDiagnostics: (id: string | null) =>
    ['scheduler', 'novel-update-diagnostics', id] as const,
  schedulerStatus: ['scheduler', 'status'] as const
};
