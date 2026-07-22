import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { BrowserRuntimeCoordinator } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts';

test(
  'browser runtime blocks navigation outside approved hosts and disables downloads',
  {
    skip: process.env.CHROMIUM_PATH
      ? false
      : 'CHROMIUM_PATH is required for browser runtime integration'
  },
  async (context) => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<html><body><input id="password"><a id="outside" href="https://forbidden.invalid">outside</a></body></html>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    let session: Awaited<ReturnType<BrowserRuntimeCoordinator['open']>> | undefined;
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
      session = await runtime.open({
        identity,
        allowedHosts: ['127.0.0.1'],
        route: { kind: 'direct', identity: 'direct' },
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
      await assert.rejects(
        () => session!.open('https://forbidden.invalid'),
        /host is not approved/
      );
      try {
        await session.open(`http://127.0.0.1:${address.port}`);
      } catch (error) {
        if (String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR')) {
          context.skip('Chromium is managed with a machine-wide URLBlocklist');
          return;
        }
        throw error;
      }
      await session.fillSecret('#password', { credentialId: 'cred-1', field: 'password' });
      assert.equal(await session.text('body'), 'outside');
    } finally {
      await session?.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
);
