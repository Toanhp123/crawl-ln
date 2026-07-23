import { startServer } from './server.js';

const running = await startServer();
console.log(`API running at ${running.url}`);

let shutdownPromise: Promise<void> | undefined;
const shutdown = () => {
  shutdownPromise ??= running
    .close()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    })
    .finally(() => {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    });
  return shutdownPromise;
};
const onSignal = () => {
  void shutdown();
};

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
