import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpContractRuntime } from './http-contract.types.ts';

export const apiRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-api-contract-'));
    const { createEnvironment } = await import('../../apps/api/src/platform/config/environment.ts');
    const { createAppRuntime } = await import('../../apps/api/src/app.ts');
    const runtime = createAppRuntime({
      environment: createEnvironment({
        ...process.env,
        STORAGE_DIR: storageDirectory,
        SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
      })
    });
    await runtime.ready;
    return {
      app: runtime.app,
      async close() {
        try {
          await runtime.lifecycle.stop();
        } finally {
          await rm(storageDirectory, { recursive: true, force: true });
        }
      }
    };
  }
};
