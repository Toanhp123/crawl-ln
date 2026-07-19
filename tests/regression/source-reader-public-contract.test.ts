import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  SourceCapability,
  SourceReaderApi,
  SourceReaderResult
} from '../../apps/api/src/modules/source-reader/public/source-reader.api.ts';
import {
  SourceReaderError,
  type SourceReaderErrorCode
} from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

test('source reader exposes stable capability and result contracts', () => {
  const capabilities: SourceCapability[] = [
    'identify',
    'metadata',
    'chapter-list',
    'chapter-content',
    'search',
    'latest-updates',
    'authentication'
  ];
  assert.equal(capabilities.length, 7);

  const result: SourceReaderResult<{ title: string }> = {
    data: { title: 'Book' },
    source: {
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      domain: 'example.test',
      capability: 'metadata'
    }
  };
  assert.equal(result.data.title, 'Book');

  const code: SourceReaderErrorCode = 'CAPABILITY_NOT_SUPPORTED';
  const error = new SourceReaderError(code, 'Missing capability', {
    retryable: false,
    fallbackAllowed: false
  });
  assert.equal(error.code, code);
  assert.equal(error.retryable, false);
  assert.equal(error.fallbackAllowed, false);

  const api = null as SourceReaderApi | null;
  assert.equal(api, null);
});
