export type SourceReaderInvalidationEvent =
  | { type: 'credential-updated' | 'credential-deleted'; credentialId: string }
  | { type: 'session-revoked'; sessionId: string }
  | { type: 'logout'; credentialId: string }
  | {
      type: 'network-profile-updated' | 'network-profile-deleted';
      networkIdentity: string;
    }
  | {
      type: 'plugin-activated' | 'plugin-upgraded' | 'plugin-disabled' | 'plugin-quarantined';
      pluginId: string;
      pluginVersion?: string;
    }
  | { type: 'chapter-list-version-changed'; pluginId: string; normalizedUrl: string };

export interface SourceReaderInvalidationPort {
  invalidate(event: SourceReaderInvalidationEvent): Promise<void>;
}
