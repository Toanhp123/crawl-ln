import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createEnvironment } from '../../apps/api/src/shared/config/env.ts';
import { apiAccessMiddleware } from '../../apps/api/src/shared/http/api-access.middleware.ts';
import { createCorsOptions } from '../../apps/api/src/shared/http/cors-options.ts';
import { isLoopbackAddress } from '../../apps/api/src/shared/http/network-address.ts';

test('loopback detection accepts IPv4, IPv6, and IPv4-mapped loopback only', () => {
  for (const address of ['127.0.0.1', '127.12.34.56', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopbackAddress(address), true, address);
  }
  for (const address of [undefined, '', '0.0.0.0', '192.168.1.10', '::ffff:192.168.1.10']) {
    assert.equal(isLoopbackAddress(address), false, String(address));
  }
});

test('environment defaults to loopback and rejects unsafe remote configuration', () => {
  const local = createEnvironment({});
  assert.equal(local.host, '127.0.0.1');
  assert.deepEqual(local.apiCorsOrigins, ['http://127.0.0.1:5173', 'http://localhost:5173']);
  assert.equal(local.apiRemoteToken, undefined);
  assert.equal(local.sourceReaderLocalAdmin, false);

  assert.throws(() => createEnvironment({ HOST: '0.0.0.0' }), /API_REMOTE_TOKEN.*32 characters/i);
  assert.throws(
    () => createEnvironment({ HOST: '0.0.0.0', API_REMOTE_TOKEN: 'too-short' }),
    /API_REMOTE_TOKEN.*32 characters/i
  );
  assert.throws(() => createEnvironment({ API_CORS_ORIGINS: '' }), /must not be empty/i);
  assert.throws(() => createEnvironment({ API_CORS_ORIGINS: '*' }), /wildcard/i);

  const remote = createEnvironment({
    HOST: '0.0.0.0',
    API_REMOTE_TOKEN: 'x'.repeat(32),
    API_CORS_ORIGINS: 'https://novel-tool.example'
  });
  assert.equal(remote.host, '0.0.0.0');
  assert.equal(remote.apiRemoteToken, 'x'.repeat(32));
  assert.deepEqual(remote.apiCorsOrigins, ['https://novel-tool.example']);
});

test('CORS options accept configured origins and reject arbitrary origins', async () => {
  const options = createCorsOptions(['http://localhost:5173']);
  const origin = options.origin;
  assert.equal(typeof origin, 'function');

  const invoke = (value: string | undefined) =>
    new Promise<{ error: Error | null; allowed?: boolean }>((resolve) => {
      (origin as Exclude<typeof origin, boolean | string | RegExp | (string | RegExp)[]>)(
        value,
        (error, allowed) => resolve({ error, allowed })
      );
    });

  assert.deepEqual(await invoke(undefined), { error: null, allowed: true });
  assert.deepEqual(await invoke('http://localhost:5173'), { error: null, allowed: true });
  const denied = await invoke('https://evil.example');
  assert.equal((denied.error as Error & { kind?: string }).kind, 'forbidden');
  assert.match(denied.error?.message ?? '', /origin is not allowed/i);
});

test('remote API access requires a timing-safe bearer token while loopback remains local', () => {
  const token = 's'.repeat(32);
  const middleware = apiAccessMiddleware({ remoteToken: token });

  const invoke = (remoteAddress: string, authorization?: string) => {
    let status = 200;
    let body: unknown;
    let nextCalled = false;
    const request = {
      socket: { remoteAddress },
      header(name: string) {
        return name.toLowerCase() === 'authorization' ? authorization : undefined;
      }
    } as unknown as Request;
    const response = {
      status(value: number) {
        status = value;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      }
    } as unknown as Response;
    middleware(request, response, (() => {
      nextCalled = true;
    }) as NextFunction);
    return {
      status,
      body,
      nextCalled,
      access: (request as Request & { apiAccess?: { isLocal: boolean } }).apiAccess
    };
  };

  const local = invoke('127.0.0.1');
  assert.equal(local.nextCalled, true);
  assert.deepEqual(local.access, { isLocal: true, authenticated: true });

  const missing = invoke('192.168.1.10');
  assert.equal(missing.status, 401);
  assert.equal(missing.nextCalled, false);

  const wrong = invoke('192.168.1.10', `Bearer ${'w'.repeat(32)}`);
  assert.equal(wrong.status, 401);

  const correct = invoke('192.168.1.10', `Bearer ${token}`);
  assert.equal(correct.nextCalled, true);
  assert.deepEqual(correct.access, { isLocal: false, authenticated: true });
});
