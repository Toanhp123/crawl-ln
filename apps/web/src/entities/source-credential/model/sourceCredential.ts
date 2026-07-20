import type { SourceReaderCredentialMetadata } from '@novel-tool/shared';
export function sourceCredentialBinding(value: SourceReaderCredentialMetadata) {
  return [value.pluginId, value.domain].filter(Boolean).join(' · ') || value.ownerType;
}
