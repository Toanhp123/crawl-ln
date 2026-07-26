export const sourcePluginProjectKeys = {
  all: ['source-plugin-projects'] as const,
  list: () => [...sourcePluginProjectKeys.all, 'list'] as const,
  detail: (id: string) => [...sourcePluginProjectKeys.all, 'detail', id] as const
};
