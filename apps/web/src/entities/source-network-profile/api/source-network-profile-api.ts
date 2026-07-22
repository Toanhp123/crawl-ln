import type { SourceReaderNetworkProfileMetadata } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type SourceNetworkProfile = SourceReaderNetworkProfileMetadata;

export function listSourceNetworkProfiles(signal?: AbortSignal): Promise<SourceNetworkProfile[]> {
  return http<SourceNetworkProfile[]>('/api/source-reader/network-profiles', { signal });
}
