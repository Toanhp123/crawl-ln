import type { SourceNetworkProfile } from './types';

export function sourceNetworkTone(
  status: SourceNetworkProfile['healthStatus']
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'offline') return 'danger';
  return 'neutral';
}
