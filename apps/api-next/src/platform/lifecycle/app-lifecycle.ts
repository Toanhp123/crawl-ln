export interface AppLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface LifecycleModule {
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export function createAppLifecycle(input: {
  database: { open(): void; close(): void };
  migrations: { run(): void };
  modules: LifecycleModule[];
  outbox: { start(): void; stop(): Promise<void> };
}): AppLifecycle {
  let started = false;
  let startedModules: LifecycleModule[] = [];

  return {
    async start() {
      if (started) return;
      input.database.open();
      try {
        input.migrations.run();
        for (const module of input.modules) {
          await module.start?.();
          startedModules.push(module);
        }
        input.outbox.start();
        started = true;
      } catch (error) {
        for (const module of [...startedModules].reverse()) await module.stop?.();
        startedModules = [];
        input.database.close();
        throw error;
      }
    },
    async stop() {
      if (!started) return;
      started = false;
      let failure: unknown;
      try {
        await input.outbox.stop();
      } catch (error) {
        failure = error;
      }
      for (const module of [...startedModules].reverse()) {
        try {
          await module.stop?.();
        } catch (error) {
          failure ??= error;
        }
      }
      startedModules = [];
      try {
        input.database.close();
      } catch (error) {
        failure ??= error;
      }
      if (failure) throw failure;
    }
  };
}
