import type { SourceCredential } from './types';

export function sourceCredentialBinding(value: SourceCredential): string {
  return [value.pluginId, value.domain].filter(Boolean).join(' · ') || value.ownerType;
}
