import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createV22Fixture } from '../../tests/helpers/v22-database.fixture.ts';

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function createV22StorageFixture(path, { replace = false } = {}) {
  const output = resolve(path);
  if (dirname(output) === output) throw new Error('Fixture output must not be a filesystem root');
  if (await exists(output)) {
    const entries = await readdir(output);
    if (entries.length > 0 && !replace) throw new Error(`Fixture output is not empty: ${output}`);
    if (entries.length > 0) await rm(output, { recursive: true, force: true });
  }
  await mkdir(output, { recursive: true });
  const fixture = await createV22Fixture(output);
  const databasePath = join(output, 'novel-tool.sqlite');
  await rename(fixture.databasePath, databasePath);
  return { ...fixture, databasePath };
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  createV22StorageFixture(option(args, '--output'), { replace: args.includes('--replace') })
    .then((fixture) => process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`))
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    });
}
