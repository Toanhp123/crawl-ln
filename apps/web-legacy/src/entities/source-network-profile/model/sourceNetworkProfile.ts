import type { SourceReaderNetworkProfileMetadata } from '@novel-tool/shared';
export function sourceNetworkTone(
  status: SourceReaderNetworkProfileMetadata['healthStatus']
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'offline') return 'danger';
  return 'neutral';
}
