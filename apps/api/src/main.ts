import { createAppRuntime } from './app.js';
import { env } from './shared/config/env.js';
import { logger } from './shared/logger/logger.js';

const runtime = createAppRuntime({ startBackgroundServices: true });
await runtime.ready;
const server = runtime.app.listen(env.port, () => {
  logger.info(`API running at http://localhost:${env.port}`);
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await runtime.lifecycle.stop();
  server.close((error) => {
    if (error) logger.error(error.stack ?? error.message);
    process.exit(error ? 1 : 0);
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
