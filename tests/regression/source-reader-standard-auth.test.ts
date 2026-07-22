import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardAuthenticationService } from '../../apps/api-legacy/src/modules/source-reader/application/services/standard-authentication.service.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';

interface RequestRecord {
  method: 'get' | 'post';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

const requests: RequestRecord[] = [];
const http = {
  get: async (url: string, options?: { headers?: Record<string, string> }) => {
    requests.push({ method: 'get' as const, url, headers: options?.headers });
    return { url, status: 200, headers: {}, data: 'ok' };
  },
  post: async (url: string, options?: { headers?: Record<string, string>; body?: unknown }) => {
    requests.push({ method: 'post' as const, url, headers: options?.headers, body: options?.body });
    return {
      url: 'https://example.test/account',
      status: 200,
      headers: {
        'set-cookie': 'sid=abc; Path=/; HttpOnly; Secure, theme=dark; Path=/'
      },
      data: 'ok'
    };
  }
};

test.beforeEach(() => requests.splice(0));

test('cookie import returns validated cookie session material', async () => {
  const service = new StandardAuthenticationService();
  const result = await service.authenticate({
    strategy: 'cookie-import',
    secret: {
      cookies: [{ name: 'sid', value: 'abc', domain: 'example.test', path: '/' }]
    },
    configuration: {},
    http
  });
  assert.equal(result.status, 'authenticated');
  if (result.status !== 'authenticated') return;
  assert.equal(result.session.kind, 'cookies');
  assert.equal(result.session.cookies?.[0]?.name, 'sid');
  assert.equal(result.session.networkBinding, 'preferred');
});

test('bearer strategy returns authorization header session material', async () => {
  const service = new StandardAuthenticationService();
  const result = await service.authenticate({
    strategy: 'bearer-token',
    secret: { token: 'secret-token' },
    configuration: {},
    http
  });
  assert.equal(result.status, 'authenticated');
  if (result.status !== 'authenticated') return;
  assert.deepEqual(result.session.headers, { Authorization: 'Bearer secret-token' });
  assert.equal(result.session.networkBinding, 'none');
});

test('basic strategy encodes username and password in authorization header', async () => {
  const service = new StandardAuthenticationService();
  const result = await service.authenticate({
    strategy: 'basic-auth',
    secret: { username: 'reader', password: 'secret' },
    configuration: {},
    http
  });
  assert.equal(result.status, 'authenticated');
  if (result.status !== 'authenticated') return;
  assert.deepEqual(result.session.headers, {
    Authorization: `Basic ${Buffer.from('reader:secret').toString('base64')}`
  });
});

test('form login posts configured fields and captures cookies', async () => {
  const service = new StandardAuthenticationService();
  const result = await service.authenticate({
    strategy: 'form-login',
    secret: { username: 'reader', password: 'secret' },
    configuration: {
      loginUrl: 'https://example.test/login',
      fields: { username: 'email', password: 'password' },
      success: { urlIncludes: '/account' }
    },
    http
  });
  assert.equal(result.status, 'authenticated');
  assert.equal(requests.at(-1)?.body instanceof URLSearchParams, true);
  assert.equal((requests.at(-1)?.body as URLSearchParams).get('email'), 'reader');
  if (result.status !== 'authenticated') return;
  assert.deepEqual(
    result.session.cookies?.map((cookie) => cookie.name),
    ['sid', 'theme']
  );
  assert.equal(result.session.cookies?.[0]?.httpOnly, true);
  assert.equal(result.session.cookies?.[0]?.secure, true);
});

test('invalid standard credentials fail with a stable typed error', async () => {
  const service = new StandardAuthenticationService();
  await assert.rejects(
    () =>
      service.authenticate({
        strategy: 'bearer-token',
        secret: {},
        configuration: {},
        http
      }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'AUTHENTICATION_FAILED'
  );
});
