import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpContractRuntime } from './http-contract.types.ts';

export const nextApiRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-api-next-contract-'));
    const { createEnvironment } =
      await import('../../apps/api-next/src/platform/config/environment.ts');
    const { createNextAppRuntime } = await import('../../apps/api-next/src/app.ts');
    const runtime = createNextAppRuntime({
      environment: createEnvironment({
        ...process.env,
        NEXT_STORAGE_DIR: storageDirectory,
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
