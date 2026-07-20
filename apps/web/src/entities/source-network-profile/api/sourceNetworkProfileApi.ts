import type {
  SourceReaderNetworkProfileCreateRequest,
  SourceReaderNetworkProfileMetadata,
  SourceReaderNetworkProfileUpdateRequest,
  SourceReaderNetworkTestResult
} from '@novel-tool/shared';
import { useQuery } from '@tanstack/react-query';
import { http, httpVoid } from '@/shared/api/http';
import { queryKeys } from '@/shared/api/queryKeys';

export const listSourceNetworkProfiles = (signal?: AbortSignal) =>
  http<SourceReaderNetworkProfileMetadata[]>('/api/source-reader/network-profiles', { signal });
export const createSourceNetworkProfile = (input: SourceReaderNetworkProfileCreateRequest) =>
  http<Record<string, unknown>>('/api/source-reader/network-profiles', {
    method: 'POST',
    body: JSON.stringify(input)
  });
export const updateSourceNetworkProfile = (
  id: string,
  input: SourceReaderNetworkProfileUpdateRequest
) =>
  httpVoid(`/api/source-reader/network-profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
export const deleteSourceNetworkProfile = (id: string) =>
  httpVoid(`/api/source-reader/network-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const testSourceNetworkProfile = (id: string) =>
  http<SourceReaderNetworkTestResult>(
    `/api/source-reader/network-profiles/${encodeURIComponent(id)}/test`,
    { method: 'POST' }
  );

export function useSourceNetworkProfilesQuery() {
  return useQuery({
    queryKey: queryKeys.sourceReader.networkProfiles(),
    queryFn: ({ signal }) => listSourceNetworkProfiles(signal)
  });
}
