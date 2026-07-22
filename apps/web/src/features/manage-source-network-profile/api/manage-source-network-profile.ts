import type {
  SourceReaderNetworkProfileCreateResult,
  SourceReaderNetworkTestResult
} from '@novel-tool/shared';
import { http, httpVoid } from '../../../shared/api';
import type {
  NetworkProfileCreateInput,
  NetworkProfileUpdateInput
} from '../model/network-profile-form';
export function createSourceNetworkProfile(input: NetworkProfileCreateInput) {
  return http<SourceReaderNetworkProfileCreateResult>('/api/source-reader/network-profiles', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
export function updateSourceNetworkProfile(profileId: string, input: NetworkProfileUpdateInput) {
  return httpVoid(`/api/source-reader/network-profiles/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}
export function deleteSourceNetworkProfile(profileId: string) {
  return httpVoid(`/api/source-reader/network-profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE'
  });
}
export function testSourceNetworkProfile(profileId: string) {
  return http<SourceReaderNetworkTestResult>(
    `/api/source-reader/network-profiles/${encodeURIComponent(profileId)}/test`,
    { method: 'POST' }
  );
}
