import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  NEXT_API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  NEXT_API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  NEXT_DATABASE_PATH: z.string().trim().min(1).optional(),
  NEXT_STORAGE_DIR: z.string().trim().min(1).optional(),
  STORAGE_DIR: z.string().trim().min(1).optional(),
  NEXT_OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).default(50),
  NEXT_OUTBOX_INTERVAL_MS: z.coerce.number().int().min(1).default(1_000)
});

export interface NextEnvironment {
  host: string;
  port: number;
  databasePath: string;
  outboxBatchSize: number;
  outboxIntervalMs: number;
}

export function createEnvironment(source: NodeJS.ProcessEnv = process.env): NextEnvironment {
  const parsed = environmentSchema.parse(source);
  const storageDirectory =
    parsed.NEXT_STORAGE_DIR ?? parsed.STORAGE_DIR ?? './apps/api-next/storage';
  return {
    host: parsed.NEXT_API_HOST,
    port: parsed.NEXT_API_PORT,
    databasePath: parsed.NEXT_DATABASE_PATH
      ? resolve(parsed.NEXT_DATABASE_PATH)
      : resolve(storageDirectory, 'novel-tool.sqlite'),
    outboxBatchSize: parsed.NEXT_OUTBOX_BATCH_SIZE,
    outboxIntervalMs: parsed.NEXT_OUTBOX_INTERVAL_MS
  };
}

export const environment = createEnvironment();
