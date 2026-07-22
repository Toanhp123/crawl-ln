import type { SourceReaderAuthenticationResult } from '@novel-tool/shared';
import { http, httpVoid } from '../../../shared/api';
export interface CredentialAuthenticationInput {
  networkProfileId?: string;
}
export function loginSourceCredential(credentialId: string, input: CredentialAuthenticationInput) {
  return http<SourceReaderAuthenticationResult>(
    `/api/source-reader/credentials/${encodeURIComponent(credentialId)}/login`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}
export function logoutSourceCredential(credentialId: string) {
  return httpVoid(`/api/source-reader/credentials/${encodeURIComponent(credentialId)}/logout`, {
    method: 'POST'
  });
}
export function testSourceCredential(credentialId: string, input: CredentialAuthenticationInput) {
  return http<SourceReaderAuthenticationResult>(
    `/api/source-reader/credentials/${encodeURIComponent(credentialId)}/test`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}
