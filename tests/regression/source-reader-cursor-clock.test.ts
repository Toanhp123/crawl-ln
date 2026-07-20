import assert from 'node:assert/strict';
import test from 'node:test';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

const key = Buffer.from('01234567890123456789012345678901');

test('cursor expiry follows the injected clock', () => {
  let now = new Date('2026-07-19T00:00:00.000Z');
  const codec = new HmacCursorCodec(key, { now: () => now });
  const token = codec.encode({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    capability: 'chapter-list',
    contractVersion: 1,
    requestFingerprint: 'request',
    offset: 0,
    expiresAt: now.getTime() + 1000
  });
  assert.equal(codec.decode(token).pluginId, 'demo');
  now = new Date(now.getTime() + 1001);
  assert.throws(
    () => codec.decode(token),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'CURSOR_INVALID'
  );
});
