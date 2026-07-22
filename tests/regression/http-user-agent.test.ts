import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAxiosRequestConfig } from '../../apps/api-legacy/src/shared/infrastructure/http/axios-http-client.adapter.js';

test('uses a deterministic mobile browser user agent for crawler requests', () => {
  const first = buildAxiosRequestConfig();
  const second = buildAxiosRequestConfig();
  const firstAgent = String(first.headers?.['User-Agent'] ?? '');
  const secondAgent = String(second.headers?.['User-Agent'] ?? '');

  assert.equal(firstAgent, secondAgent);
  assert.match(firstAgent, /^Mozilla\/5\.0/);
  assert.match(firstAgent, /Mobile Safari/);
  assert.doesNotMatch(firstAgent, /NovelTool/);
});
