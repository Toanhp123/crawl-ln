import 'dotenv/config';
import { resolve } from 'node:path';

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function optionalBase64Key(name: string): Buffer | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error(`${name} must be base64 for exactly 32 bytes`);
  return decoded;
}

function jsonEnv<T>(name: string, fallback: T): T {
  const value = process.env[name];
  return value ? (JSON.parse(value) as T) : fallback;
}

function listEnv(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  appVersion: process.env.APP_VERSION ?? '2.9.6',
  port: Number(process.env.PORT ?? 3000),
  storageDir: process.env.STORAGE_DIR ?? './storage',
  maxChaptersPerRun: numberEnv('MAX_CHAPTERS_PER_RUN', 50),
  crawlerConcurrency: numberEnv('CRAWLER_CONCURRENCY', 2),
  crawlerRetry: numberEnv('CRAWLER_RETRY', 2),
  crawlerDelayMs: numberEnv('CRAWLER_DELAY_MS', 600),
  requestTimeoutMs: numberEnv('REQUEST_TIMEOUT_MS', 15000),
  maxHttpResponseBytes: numberEnv('MAX_HTTP_RESPONSE_BYTES', 20 * 1024 * 1024),
  crawlerRetryBaseDelayMs: numberEnv('CRAWLER_RETRY_BASE_DELAY_MS', 1000),
  crawlerRetryMaxDelayMs: numberEnv('CRAWLER_RETRY_MAX_DELAY_MS', 15000),
  maxExportSourceBytes: numberEnv('MAX_EXPORT_SOURCE_BYTES', 128 * 1024 * 1024),
  minChapterContentChars: numberEnv('MIN_CHAPTER_CONTENT_CHARS', 200),
  sourceAllowlist: listEnv('SOURCE_ALLOWLIST'),
  sourceReaderCursorKey:
    process.env.SOURCE_READER_CURSOR_KEY ?? 'development-only-source-reader-cursor-key-32-bytes',
  sourceReaderMemoryCacheEntries: numberEnv('SOURCE_READER_MEMORY_CACHE_ENTRIES', 500),
  sourceReaderMasterKey: optionalBase64Key('SOURCE_READER_MASTER_KEY'),
  sourceReaderBrowserExecutable: process.env.SOURCE_READER_BROWSER_EXECUTABLE || undefined,
  sourceReaderNetworkDiagnosticUrl:
    process.env.SOURCE_READER_NETWORK_DIAGNOSTIC_URL ?? 'https://example.com/',
  sourceReaderExternalProcessStartTimeoutMs: numberEnv(
    'SOURCE_READER_EXTERNAL_PROCESS_START_TIMEOUT_MS',
    10_000
  ),
  sourceReaderPluginPolicyViolationThreshold: numberEnv(
    'SOURCE_READER_PLUGIN_POLICY_VIOLATION_THRESHOLD',
    3
  ),
  sourceReaderDefaultRoles: jsonEnv<
    Array<'reader' | 'source-manager' | 'source-admin' | 'system-admin'>
  >('SOURCE_READER_DEFAULT_ROLES_JSON', [
    'reader',
    'source-manager',
    'source-admin',
    'system-admin'
  ]),
  sourceReaderTrustRoleHeaders: boolEnv('SOURCE_READER_TRUST_ROLE_HEADERS', false),
  sourceReaderPluginDir:
    process.env.SOURCE_READER_PLUGIN_DIR ??
    resolve(process.env.STORAGE_DIR ?? './storage', 'source-plugins'),
  sourceReaderTrustedKeys: jsonEnv<
    Array<{ id: string; algorithm: 'ed25519'; publicKeyPem: string }>
  >('SOURCE_READER_TRUSTED_KEYS_JSON', [])
};
