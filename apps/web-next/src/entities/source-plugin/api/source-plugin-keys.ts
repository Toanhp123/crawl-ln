export const sourcePluginKeys = {
  all: ['source-reader', 'plugins'] as const,
  list: () => ['source-reader', 'plugins'] as const,
  detail: (pluginId: string) => ['source-reader', 'plugins', pluginId] as const,
  health: (pluginId: string) => ['source-reader', 'plugins', pluginId, 'health'] as const,
  permissions: (pluginId: string) => ['source-reader', 'plugins', pluginId, 'permissions'] as const
};
