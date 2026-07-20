export async function invokeCapability(_payload, context) {
  const results = {};
  for (const [name, load] of [
    ['fs', () => import('node:fs')],
    ['childProcess', () => import('node:child_process')],
    ['net', () => import('node:net')],
    ['workerThreads', () => import('node:worker_threads')]
  ]) {
    try {
      await load();
      results[name] = 'ALLOWED';
    } catch (error) {
      results[name] = error?.code ?? error?.name ?? 'BLOCKED';
    }
  }
  results.env = globalThis.process?.env?.SOURCE_READER_MASTER_KEY ?? 'BLOCKED';
  results.fetch = typeof globalThis.fetch;
  results.clock = await context.host.clockNow();
  return { data: results };
}
