import { createHash } from 'node:crypto';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { Page } from '../../public/source-reader.models.js';
import type {
  ExecutableSourceCapability,
  SourceReaderCandidate,
  SourceReaderCursorPayload,
  SourceReaderCursorPort,
  SourceReaderExecutableRequest
} from '../source-reader.ports.js';

type PagedCapability = 'chapter-list' | 'search' | 'latest-updates';

const defaultLimit = 100;
const maxLimit = 500;
const cursorTtlMs = 24 * 60 * 60_000;

function isPaged(capability: ExecutableSourceCapability): capability is PagedCapability {
  return ['chapter-list', 'search', 'latest-updates'].includes(capability);
}

export class PaginationCoordinator {
  constructor(
    private readonly cursors: SourceReaderCursorPort,
    private readonly clock: { now(): Date }
  ) {}

  prepare(input: {
    capability: ExecutableSourceCapability;
    request: SourceReaderExecutableRequest;
    candidates: SourceReaderCandidate[];
  }): { candidates: SourceReaderCandidate[]; cursor?: SourceReaderCursorPayload } {
    const cursor = this.decode(input.capability, input.request.cursor);
    if (!cursor) return { candidates: input.candidates };
    const candidates = input.candidates.filter(
      (candidate) => candidate.pluginId === cursor.pluginId
    );
    if (candidates.length === 0) {
      throw new SourceReaderError(
        'CURSOR_INVALIDATED',
        'Cursor plugin is no longer available for this source',
        { retryable: false, fallbackAllowed: false }
      );
    }
    return { candidates, cursor };
  }

  validateBinding(input: {
    capability: ExecutableSourceCapability;
    request: SourceReaderExecutableRequest;
    candidate: SourceReaderCandidate;
    cursor?: SourceReaderCursorPayload;
  }): void {
    if (!input.cursor || !isPaged(input.capability)) return;
    if (
      input.cursor.pluginId !== input.candidate.pluginId ||
      input.cursor.pluginVersion !== input.candidate.pluginVersion ||
      input.cursor.contractVersion !== input.candidate.contractVersion ||
      input.cursor.requestFingerprint !==
        this.requestFingerprint(input.capability, input.request, input.candidate.normalizedUrl) ||
      JSON.stringify(input.cursor.extensionContractVersions) !==
        JSON.stringify(this.extensionVersions(input.candidate))
    ) {
      throw new SourceReaderError(
        'CURSOR_INVALIDATED',
        'Cursor no longer matches the selected plugin or request',
        { retryable: false, fallbackAllowed: false }
      );
    }
  }

  pluginRequest(input: {
    capability: ExecutableSourceCapability;
    request: SourceReaderExecutableRequest;
    cursor?: SourceReaderCursorPayload;
  }): Record<string, unknown> {
    switch (input.capability) {
      case 'search':
        return {
          url: input.request.url,
          query: input.request.query ?? '',
          ...(input.cursor?.pluginCursor ? { cursor: input.cursor.pluginCursor } : {}),
          limit: maxLimit
        };
      case 'chapter-list':
      case 'latest-updates':
        return {
          url: input.request.url,
          ...(input.cursor?.pluginCursor ? { cursor: input.cursor.pluginCursor } : {}),
          limit: maxLimit
        };
      default:
        return { url: input.request.url };
    }
  }

  applyPage<T>(input: {
    capability: PagedCapability;
    candidate: SourceReaderCandidate;
    request: SourceReaderExecutableRequest;
    page: Page<T>;
    cursor?: SourceReaderCursorPayload;
  }): Page<T> {
    if (input.page.hasMore && !input.page.nextCursor) {
      return this.invalid('Plugin page reports more data without a next cursor');
    }
    if (input.page.hasMore && input.page.items.length === 0) {
      return this.invalid('Plugin page reports more data without returning any items');
    }
    if (input.page.hasMore && input.page.nextCursor === input.cursor?.pluginCursor) {
      return this.invalid('Plugin pagination cursor did not advance');
    }

    const limit = this.limit(input.request.limit);
    const offset = input.cursor?.offset ?? 0;
    if (offset > input.page.items.length) {
      return this.invalid('Plugin page no longer contains the signed cursor offset');
    }
    const items = input.page.items.slice(offset, offset + limit);
    const consumed = offset + items.length;
    let nextOffset: number | undefined;
    let nextPluginCursor: string | undefined;
    if (consumed < input.page.items.length) {
      nextOffset = consumed;
      nextPluginCursor = input.cursor?.pluginCursor;
    } else if (input.page.hasMore && input.page.nextCursor) {
      nextOffset = 0;
      nextPluginCursor = input.page.nextCursor;
    }

    const nextCursor =
      nextOffset === undefined
        ? undefined
        : this.cursors.encode({
            pluginId: input.candidate.pluginId,
            pluginVersion: input.candidate.pluginVersion,
            capability: input.capability,
            contractVersion: input.candidate.contractVersion,
            requestFingerprint: this.requestFingerprint(
              input.capability,
              input.request,
              input.candidate.normalizedUrl
            ),
            extensionContractVersions: this.extensionVersions(input.candidate),
            ...(nextPluginCursor ? { pluginCursor: nextPluginCursor } : {}),
            offset: nextOffset,
            expiresAt: this.clock.now().getTime() + cursorTtlMs
          });
    return { items, ...(nextCursor ? { nextCursor } : {}), hasMore: nextCursor !== undefined };
  }

  limit(value: unknown): number {
    const numeric = typeof value === 'number' ? Math.floor(value) : defaultLimit;
    return Math.max(1, Math.min(numeric, maxLimit));
  }

  private decode(
    capability: ExecutableSourceCapability,
    token: string | undefined
  ): SourceReaderCursorPayload | undefined {
    if (!token) return undefined;
    if (!isPaged(capability)) {
      throw new SourceReaderError('CURSOR_INVALID', 'This capability does not accept cursors', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    let payload: SourceReaderCursorPayload;
    try {
      payload = this.cursors.decode(token);
    } catch (error) {
      if (error instanceof SourceReaderError) throw error;
      throw new SourceReaderError('CURSOR_INVALID', 'Cursor could not be decoded', {
        retryable: false,
        fallbackAllowed: false,
        cause: error
      });
    }
    if (payload.capability !== capability || payload.expiresAt <= this.clock.now().getTime()) {
      throw new SourceReaderError('CURSOR_INVALIDATED', 'Cursor is expired or mismatched', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return payload;
  }

  private requestFingerprint(
    capability: ExecutableSourceCapability,
    request: SourceReaderExecutableRequest,
    normalizedUrl: string
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          capability,
          url: normalizedUrl,
          query: capability === 'search' ? request.query : undefined
        })
      )
      .digest('hex');
  }

  private extensionVersions(candidate: SourceReaderCandidate): Record<string, string> {
    return Object.fromEntries(
      Object.entries(candidate.extensionContractVersions ?? {}).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    );
  }

  private invalid(message: string): never {
    throw new SourceReaderError('PLUGIN_RESULT_INVALID', message, {
      retryable: false,
      fallbackAllowed: true
    });
  }
}
