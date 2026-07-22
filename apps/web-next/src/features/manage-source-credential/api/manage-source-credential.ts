import type { SourceReaderCredentialCreateResult } from '@novel-tool/shared';
import { http, httpVoid } from '../../../shared/api';
import type { CredentialCreateInput } from '../model/credential-form';

export function createSourceCredential(input: CredentialCreateInput) {
  return http<SourceReaderCredentialCreateResult>('/api/source-reader/credentials', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
export function updateSourceCredentialSecret(
  credentialId: string,
  secret: Record<string, unknown>
) {
  return httpVoid(`/api/source-reader/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ secret })
  });
}
export function deleteSourceCredential(credentialId: string) {
  return httpVoid(`/api/source-reader/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE'
  });
}
