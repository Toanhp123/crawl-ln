import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { HttpContractRuntime } from './http-contract.types.ts';
import { withContractServer } from './http-server.harness.ts';

test('contract harness closes the runtime when listener startup fails', async () => {
  let runtimeClosed = false;
  const runtime: HttpContractRuntime = {
    async create() {
      return {
        app: {
          listen() {
            const server = new EventEmitter();
            queueMicrotask(() => server.emit('error', new Error('listen failed')));
            return server;
          }
        } as never,
        async close() {
          runtimeClosed = true;
        }
      };
    }
  };

  await assert.rejects(() => withContractServer(runtime, async () => undefined), /listen failed/);
  assert.equal(runtimeClosed, true);
});
