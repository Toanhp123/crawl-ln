import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ClockPort } from '../../application/ports/runtime-support.ports.js';
import type {
  SourceReaderCursorPayload,
  SourceReaderCursorPort
} from '../../application/source-reader.ports.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

export class HmacCursorCodec implements SourceReaderCursorPort {
  constructor(
    private readonly key: Buffer,
    private readonly clock: ClockPort
  ) {
    if (key.length < 32) throw new Error('Cursor key must be at least 32 bytes');
  }

  encode(payload: SourceReaderCursorPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  decode(token: string): SourceReaderCursorPayload {
    try {
      const [body, signature, extra] = token.split('.');
      if (!body || !signature || extra) return this.invalid();
      const expected = createHmac('sha256', this.key).update(body).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return this.invalid();
      }
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8')
      ) as SourceReaderCursorPayload;
      if (
        !payload ||
        typeof payload.pluginId !== 'string' ||
        typeof payload.pluginVersion !== 'string' ||
        !['chapter-list', 'search', 'latest-updates'].includes(payload.capability) ||
        !Number.isInteger(payload.contractVersion) ||
        typeof payload.requestFingerprint !== 'string' ||
        !payload.extensionContractVersions ||
        typeof payload.extensionContractVersions !== 'object' ||
        Array.isArray(payload.extensionContractVersions) ||
        Object.entries(payload.extensionContractVersions).some(
          ([namespace, version]) => !namespace || typeof version !== 'string'
        ) ||
        (payload.pluginCursor !== undefined && typeof payload.pluginCursor !== 'string') ||
        !Number.isInteger(payload.offset) ||
        typeof payload.expiresAt !== 'number' ||
        payload.expiresAt <= this.clock.now().getTime()
      ) {
        return this.invalid();
      }
      return payload;
    } catch (error) {
      if (error instanceof SourceReaderError) throw error;
      return this.invalid();
    }
  }

  private invalid(): never {
    throw new SourceReaderError('CURSOR_INVALID', 'Cursor is invalid or expired', {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
