import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importV22Database } from './v22-importer.js';

export const V3_STORAGE_SCHEMA_VERSION = 23;

function normalizeMigrationTimestamps(sourcePath: string, targetPath: string): void {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const sourceRow = source
    .prepare('SELECT MAX(applied_at) AS applied_at FROM schema_migrations')
    .get() as { applied_at?: string } | undefined;
  source.close();

  const appliedAt = sourceRow?.applied_at ?? '1970-01-01T00:00:00.000Z';
  const target = new DatabaseSync(targetPath);
  try {
    target.exec('BEGIN IMMEDIATE;');
    target.prepare('UPDATE platform_module_migrations SET applied_at = ?').run(appliedAt);
    target.exec('COMMIT;');
  } catch (error) {
    try {
      target.exec('ROLLBACK;');
    } catch {
      // Preserve the original migration error.
    }
    throw error;
  } finally {
    target.close();
  }
}

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export async function importV22StagingDatabase(input: { sourcePath: string; targetPath: string }) {
  const report = await importV22Database(input);
  normalizeMigrationTimestamps(input.sourcePath, input.targetPath);
  const targetDatabaseSha256 = createHash('sha256')
    .update(await readFile(input.targetPath))
    .digest('hex');
  return {
    ...report,
    targetDatabaseSha256,
    candidateSchemaVersion: V3_STORAGE_SCHEMA_VERSION
  };
}

async function main(args: string[]): Promise<void> {
  const report = await importV22StagingDatabase({
    sourcePath: option(args, '--source'),
    targetPath: option(args, '--target')
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
