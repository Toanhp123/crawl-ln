import type { HttpContractRuntime } from './http-contract.types.ts';

export const nextApiRuntime: HttpContractRuntime = {
  async create() {
    const { createNextAppRuntime } = await import('../../apps/api-next/src/app.ts');
    const runtime = createNextAppRuntime();
    await runtime.ready;
    return { app: runtime.app, close: () => runtime.lifecycle.stop() };
  }
};
