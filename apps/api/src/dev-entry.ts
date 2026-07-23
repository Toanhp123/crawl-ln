import { startServer } from './server.js';

let closePromise: Promise<void> | undefined;
let running: Awaited<ReturnType<typeof startServer>> | undefined;

async function shutdown(): Promise<void> {
  closePromise ??= (async () => {
    if (running) await running.close();
    if (process.connected) {
      process.send?.({ type: 'stopped' });
      process.disconnect();
    }
  })();
  return closePromise;
}

try {
  running = await startServer();
  process.send?.({ type: 'ready', url: running.url });

  process.on('message', (message) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'shutdown'
    ) {
      void shutdown();
    }
  });
  process.once('disconnect', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
  await shutdown().catch(() => undefined);
}
