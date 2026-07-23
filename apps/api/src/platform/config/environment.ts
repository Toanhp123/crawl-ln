import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { isLoopbackAddress } from '../http/network-address.js';

const apiRootDirectory = fileURLToPath(new URL('../../../', import.meta.url));
loadDotenv({ path: resolve(apiRootDirectory, '.env') });
const defaultStorageDirectory = resolve(apiRootDirectory, 'storage');

const environmentSchema = z.object({
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_PATH: z.string().trim().min(1).optional(),
  STORAGE_DIR: z.string().trim().min(1).optional(),
  API_CORS_ORIGINS: z.string().optional(),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).default(50),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().min(1).default(1_000)
});

export interface Environment {
  host: string;
  port: number;
  databasePath: string;
  storageDirectory: string;
  storageDirectoryIsDefault: boolean;
  appVersion?: string;
  apiCorsOrigins?: string[];
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

function resolveApiPath(value: string): string {
  return resolve(apiRootDirectory, value);
}

function corsOrigins(value?: string): string[] {
  const origins = (value === undefined ? 'http://127.0.0.1:5173,http://localhost:5173' : value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error('API_CORS_ORIGINS must not be empty');
  if (origins.includes('*')) throw new Error('API_CORS_ORIGINS wildcard is not allowed');
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`API_CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }
  return [...new Set(origins)];
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
): NonNullable<Environment['sourceReaderTrustedKeys']> {
  const value = source.SOURCE_READER_TRUSTED_KEYS_JSON;
  return value ? (JSON.parse(value) as NonNullable<Environment['sourceReaderTrustedKeys']>) : [];
}

export function createEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.parse(source);
  const apiRemoteToken = source.API_REMOTE_TOKEN?.trim() || undefined;
  if (!isLoopbackAddress(parsed.HOST) && (!apiRemoteToken || apiRemoteToken.length < 32)) {
    throw new Error('API_REMOTE_TOKEN must contain at least 32 characters for non-loopback HOST');
  }
  const configuredStorageDirectory = parsed.STORAGE_DIR;
  const storageDirectory = configuredStorageDirectory
    ? resolveApiPath(configuredStorageDirectory)
    : defaultStorageDirectory;
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH
      ? resolveApiPath(parsed.DATABASE_PATH)
      : resolve(storageDirectory, 'novel-tool.sqlite'),
    storageDirectory,
    storageDirectoryIsDefault: configuredStorageDirectory === undefined,
    appVersion: source.APP_VERSION ?? '3.0.0',
    apiCorsOrigins: corsOrigins(parsed.API_CORS_ORIGINS),
    outboxBatchSize: parsed.OUTBOX_BATCH_SIZE,
    outboxIntervalMs: parsed.OUTBOX_INTERVAL_MS,
    crawlerDelayMs: numberEnv(source, 'CRAWLER_DELAY_MS', 600),
    maxExportSourceBytes: numberEnv(source, 'MAX_EXPORT_SOURCE_BYTES', 128 * 1024 * 1024),
    sourceAllowlist: lowerListEnv(source, 'SOURCE_ALLOWLIST'),
    apiRemoteToken,
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
    sourceReaderPluginDir: source.SOURCE_READER_PLUGIN_DIR
      ? resolveApiPath(source.SOURCE_READER_PLUGIN_DIR)
      : resolve(storageDirectory, 'source-plugins'),
    sourceReaderTrustedKeys: trustedKeys(source)
  };
}

export const environment = createEnvironment();
