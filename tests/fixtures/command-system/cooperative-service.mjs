import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [root, mode] = process.argv.slice(2);
await mkdir(root, { recursive: true });
await writeFile(join(root, 'pid'), String(process.pid));

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await writeFile(join(root, 'closed'), 'closed\n');
  process.send?.({ type: 'stopped' });
  process.disconnect?.();
}

process.on('message', (message) => {
  if (message?.type === 'shutdown') void close();
});
process.on('disconnect', () => void close());
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
process.send?.({ type: 'ready', url: 'fixture://ready' });

if (mode === '--fail-after-ready') {
  setTimeout(() => {
    process.exitCode = 1;
    void close();
  }, 25).unref();
}

await new Promise((resolve) => process.once('beforeExit', resolve));
