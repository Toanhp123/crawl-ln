export interface CursorPayload {
  pluginId: string;
  pluginVersion: string;
  capability: 'chapter-list' | 'search' | 'latest-updates';
  contractVersion: number;
  requestFingerprint: string;
  pluginCursor?: string;
  offset: number;
  expiresAt: number;
}

export interface CursorCodecPort {
  encode(payload: CursorPayload): string;
  decode(token: string): CursorPayload;
}
