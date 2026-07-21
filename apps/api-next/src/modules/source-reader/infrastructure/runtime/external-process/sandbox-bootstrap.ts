import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function sandboxEntryPath(): string {
  const directory = dirname(fileURLToPath(import.meta.url));
  return resolve(directory, 'sandbox-entry.mjs');
}

export function minimumSupportedNodeVersion(): { major: number; minor: number } {
  return { major: 22, minor: 12 };
}
