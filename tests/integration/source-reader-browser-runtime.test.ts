import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { BrowserRuntimeCoordinator } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts';

test(
  'browser runtime blocks navigation outside approved hosts and disables downloads',
  {
    skip: process.env.CHROMIUM_PATH
      ? false
      : 'CHROMIUM_PATH is required for browser runtime integration'
  },
  async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<html><body><input id="password"><a id="outside" href="https://forbidden.invalid">outside</a></body></html>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind');
      const runtime = new BrowserRuntimeCoordinator({
        browserExecutablePath: process.env.CHROMIUM_PATH,
        credentialResolver: async () => 'secret'
      });
      const identity = {
        userId: 'u1',
        pluginId: 'demo',
        sourceAccountId: 'a1',
        networkRouteId: 'direct'
      };
      const session = await runtime.open({
        identity,
        allowedHosts: ['127.0.0.1'],
        signal: new AbortController().signal
      });
      assert.equal(
        await runtime.open({
          identity,
          allowedHosts: ['127.0.0.1'],
          signal: new AbortController().signal
        }),
        session
      );
      await session.open(`http://127.0.0.1:${address.port}`);
      await session.fillSecret('#password', { credentialId: 'cred-1', field: 'password' });
      assert.equal(await session.text('body'), 'outside');
      await assert.rejects(() => session.open('https://forbidden.invalid'));
      await session.close();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
);
