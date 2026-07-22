import type { SourceReaderCredentialMetadata } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type SourceCredential = SourceReaderCredentialMetadata;

export function listSourceCredentials(signal?: AbortSignal): Promise<SourceCredential[]> {
  return http<SourceCredential[]>('/api/source-reader/credentials', { signal });
}
