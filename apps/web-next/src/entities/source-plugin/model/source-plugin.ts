import type { SourcePlugin } from './types';

export function sourcePluginTone(
  plugin: SourcePlugin
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (plugin.status === 'active' && plugin.health?.status !== 'failed') return 'success';
  if (plugin.status === 'failed' || plugin.status === 'quarantined') return 'danger';
  if (plugin.status === 'disabled' || plugin.status === 'installed') return 'neutral';
  return 'warning';
}
