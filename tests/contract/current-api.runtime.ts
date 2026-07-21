import type { HttpContractRuntime } from './http-contract.types.ts';

export const currentApiRuntime: HttpContractRuntime = {
  async create() {
    const { createAppRuntime } = await import('../../apps/api/src/app.ts');
    const runtime = createAppRuntime({ startBackgroundServices: false });
    await runtime.ready;
    return { app: runtime.app, close: () => runtime.lifecycle.stop() };
  }
};
