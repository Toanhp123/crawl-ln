import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type {
  ReplaceJournal,
  ReplaceJournalPort
} from '../../application/ports/replace-journal.port.js';

const journalSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().min(1),
    databasePath: z.string().min(1),
    newDatabasePath: z.string().min(1),
    rollbackDatabasePath: z.string().min(1),
    stage: z.enum(['prepared', 'old-moved', 'new-promoted', 'reopened'])
  })
  .strict();

async function fsyncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (!['EPERM', 'EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP'].includes(String(code))) throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export class NodeReplaceJournalStore implements ReplaceJournalPort {
  readonly path: string;

  constructor(storageDirectory: string) {
    this.path = resolve(storageDirectory, 'replace-journal.json');
  }

  async read(): Promise<ReplaceJournal | null> {
    try {
      return journalSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(journal: ReplaceJournal): Promise<void> {
    const validated = journalSchema.parse(journal);
    const temporary = `${this.path}.tmp-${randomUUID()}`;
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(validated)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.path);
      await fsyncDirectory(dirname(this.path));
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true });
    await fsyncDirectory(dirname(this.path));
  }
}
