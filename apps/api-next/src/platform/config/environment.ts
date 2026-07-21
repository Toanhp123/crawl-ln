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
  storageDirectory?: string;
  appVersion?: string;
  outboxBatchSize: number;
  outboxIntervalMs: number;
  crawlerDelayMs: number;
  maxExportSourceBytes: number;
  sourceAllowlist: string[];
  apiRemoteToken?: string;
  requestTimeoutMs?: number;
  sourceReaderCursorKey?: string;
  sourceReaderMasterKey?: Buffer;
  sourceReaderBrowserExecutable?: string;
  sourceReaderNetworkDiagnosticUrl?: string;
  sourceReaderExternalProcessStartTimeoutMs?: number;
  sourceReaderPluginPolicyViolationThreshold?: number;
  sourceReaderLocalAdmin?: boolean;
  sourceReaderTrustRoleHeaders?: boolean;
  sourceReaderPluginDir?: string;
  sourceReaderTrustedKeys?: Array<{
    id: string;
    algorithm: 'ed25519';
    publicKeyPem: string;
  }>;
}

function boolEnv(source: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = source[name];
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function numberEnv(source: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = Number(source[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function lowerListEnv(source: NodeJS.ProcessEnv, name: string): string[] {
  return (source[name] ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function optionalBase64Key(source: NodeJS.ProcessEnv, name: string): Buffer | undefined {
  const value = source[name];
  if (!value) return undefined;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error(`${name} must be base64 for exactly 32 bytes`);
  return decoded;
}

function trustedKeys(
  source: NodeJS.ProcessEnv
): NonNullable<NextEnvironment['sourceReaderTrustedKeys']> {
  const value = source.SOURCE_READER_TRUSTED_KEYS_JSON;
  return value
    ? (JSON.parse(value) as NonNullable<NextEnvironment['sourceReaderTrustedKeys']>)
    : [];
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
    storageDirectory: resolve(storageDirectory),
    appVersion: source.APP_VERSION ?? '2.9.6',
    outboxBatchSize: parsed.NEXT_OUTBOX_BATCH_SIZE,
    outboxIntervalMs: parsed.NEXT_OUTBOX_INTERVAL_MS,
    crawlerDelayMs: numberEnv(source, 'CRAWLER_DELAY_MS', 600),
    maxExportSourceBytes: numberEnv(source, 'MAX_EXPORT_SOURCE_BYTES', 128 * 1024 * 1024),
    sourceAllowlist: lowerListEnv(source, 'SOURCE_ALLOWLIST'),
    apiRemoteToken: source.API_REMOTE_TOKEN?.trim() || undefined,
    requestTimeoutMs: numberEnv(source, 'REQUEST_TIMEOUT_MS', 15_000),
    sourceReaderCursorKey:
      source.SOURCE_READER_CURSOR_KEY ?? 'development-only-source-reader-cursor-key-32-bytes',
    sourceReaderMasterKey: optionalBase64Key(source, 'SOURCE_READER_MASTER_KEY'),
    sourceReaderBrowserExecutable: source.SOURCE_READER_BROWSER_EXECUTABLE || undefined,
    sourceReaderNetworkDiagnosticUrl:
      source.SOURCE_READER_NETWORK_DIAGNOSTIC_URL ?? 'https://example.com/',
    sourceReaderExternalProcessStartTimeoutMs: numberEnv(
      source,
      'SOURCE_READER_EXTERNAL_PROCESS_START_TIMEOUT_MS',
      10_000
    ),
    sourceReaderPluginPolicyViolationThreshold: numberEnv(
      source,
      'SOURCE_READER_PLUGIN_POLICY_VIOLATION_THRESHOLD',
      3
    ),
    sourceReaderLocalAdmin: boolEnv(source, 'SOURCE_READER_LOCAL_ADMIN', false),
    sourceReaderTrustRoleHeaders: boolEnv(source, 'SOURCE_READER_TRUST_ROLE_HEADERS', false),
    sourceReaderPluginDir:
      source.SOURCE_READER_PLUGIN_DIR ?? resolve(storageDirectory, 'source-plugins'),
    sourceReaderTrustedKeys: trustedKeys(source)
  };
}

export const environment = createEnvironment();
