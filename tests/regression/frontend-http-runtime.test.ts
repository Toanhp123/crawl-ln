import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../../apps/web/src/shared/api/errors.ts';
import { http, httpVoid } from '../../apps/web/src/shared/api/http.ts';

function mockFetch(response: Response) {
  globalThis.fetch = (async () => response) as typeof fetch;
}

test('frontend HTTP client unwraps the canonical success envelope', async () => {
  mockFetch(
    new Response(JSON.stringify({ data: { ok: true }, error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
  assert.deepEqual(await http<{ ok: boolean }>('/api/test'), { ok: true });
});

test('frontend HTTP client rejects legacy raw JSON payloads', async () => {
  mockFetch(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
  await assert.rejects(
    () => http('/api/test'),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      return true;
    }
  );
});

test('frontend HTTP void helper accepts only the backend 204 contract', async () => {
  mockFetch(new Response(null, { status: 204 }));
  await httpVoid('/api/novels/id', { method: 'DELETE' });

  mockFetch(
    new Response(JSON.stringify({ data: null, error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
  await assert.rejects(() => httpVoid('/api/novels/id', { method: 'DELETE' }), ApiError);
});
