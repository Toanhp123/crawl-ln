import { createNextAppRuntime } from './app.js';
import { environment } from './platform/config/environment.js';

const runtime = createNextAppRuntime();
await runtime.ready;

const server = runtime.app.listen(environment.port, environment.host, () => {
  console.log(`API Next running at http://${environment.host}:${environment.port}`);
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await runtime.lifecycle.stop();
  server.close((error) => {
    if (error) console.error(error.stack ?? error.message);
    process.exit(error ? 1 : 0);
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
