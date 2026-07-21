import type { ReaderCachePort } from '../../ports/reader-cache.port.js';
import type {
  SourceReaderInvalidationEvent,
  SourceReaderInvalidationPort
} from '../../ports/source-reader-invalidation.port.js';

export interface SourceReaderInvalidationSessions {
  revokeMatching(event: SourceReaderInvalidationEvent): Promise<number>;
}

export interface SourceReaderInvalidationBrowser {
  closeMatching(event: SourceReaderInvalidationEvent): Promise<number>;
}

export interface SourceReaderInvalidationObservability {
  invalidationFinished(input: { eventType: string; affectedCount: number }): void;
}

function tagsFor(event: SourceReaderInvalidationEvent): string[] {
  switch (event.type) {
    case 'credential-updated':
    case 'credential-deleted':
    case 'logout':
      return [`credential:${event.credentialId}`];
    case 'session-revoked':
      return [`session:${event.sessionId}`];
    case 'network-profile-updated':
    case 'network-profile-deleted':
      return [`network:${event.networkIdentity}`, `network-profile:${event.networkIdentity}`];
    case 'plugin-activated':
    case 'plugin-upgraded':
    case 'plugin-disabled':
    case 'plugin-quarantined':
      return [
        `plugin:${event.pluginId}`,
        ...(event.pluginVersion ? [`plugin-version:${event.pluginId}@${event.pluginVersion}`] : [])
      ];
    case 'chapter-list-version-changed':
      return [`chapter-list:${event.pluginId}:${event.normalizedUrl}`];
  }
}

export class SourceReaderInvalidationService implements SourceReaderInvalidationPort {
  constructor(
    private readonly sessions: SourceReaderInvalidationSessions,
    private readonly browser: SourceReaderInvalidationBrowser,
    private readonly caches: ReadonlyArray<Pick<ReaderCachePort, 'invalidate'>>,
    private readonly observability: SourceReaderInvalidationObservability = {
      invalidationFinished() {}
    }
  ) {}

  async invalidate(event: SourceReaderInvalidationEvent): Promise<void> {
    const tags = tagsFor(event);
    const sessionCount = await this.sessions.revokeMatching(event);
    const browserCount = await this.browser.closeMatching(event);
    await Promise.all(this.caches.map((cache) => cache.invalidate(tags)));
    this.observability.invalidationFinished({
      eventType: event.type,
      affectedCount: sessionCount + browserCount
    });
  }
}
