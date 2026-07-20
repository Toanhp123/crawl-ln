import type {
  SourceReaderAuthenticationResult,
  SourceReaderCredentialCreateRequest,
  SourceReaderCredentialCreateResult,
  SourceReaderCredentialLoginRequest,
  SourceReaderCredentialMetadata,
  SourceReaderCredentialSecretRequest
} from '@novel-tool/shared';
import { useQuery } from '@tanstack/react-query';
import { http, httpVoid } from '@/shared/api/http';
import { queryKeys } from '@/shared/api/queryKeys';

export const listSourceCredentials = (signal?: AbortSignal) =>
  http<SourceReaderCredentialMetadata[]>('/api/source-reader/credentials', { signal });
export const createSourceCredential = (input: SourceReaderCredentialCreateRequest) =>
  http<SourceReaderCredentialCreateResult>('/api/source-reader/credentials', {
    method: 'POST',
    body: JSON.stringify(input)
  });
export const updateSourceCredentialSecret = (
  id: string,
  input: SourceReaderCredentialSecretRequest
) =>
  httpVoid(`/api/source-reader/credentials/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
export const deleteSourceCredential = (id: string) =>
  httpVoid(`/api/source-reader/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const loginSourceCredential = (id: string, input: SourceReaderCredentialLoginRequest) =>
  http<SourceReaderAuthenticationResult>(
    `/api/source-reader/credentials/${encodeURIComponent(id)}/login`,
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
export const logoutSourceCredential = (id: string) =>
  httpVoid(`/api/source-reader/credentials/${encodeURIComponent(id)}/logout`, { method: 'POST' });
export const testSourceCredential = (id: string, input: SourceReaderCredentialLoginRequest) =>
  http<SourceReaderAuthenticationResult>(
    `/api/source-reader/credentials/${encodeURIComponent(id)}/test`,
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );

export function useSourceCredentialsQuery() {
  return useQuery({
    queryKey: queryKeys.sourceReader.credentials(),
    queryFn: ({ signal }) => listSourceCredentials(signal)
  });
}
