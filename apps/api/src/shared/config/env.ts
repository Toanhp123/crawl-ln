import 'dotenv/config';
import { resolve } from 'node:path';
import { isLoopbackAddress } from '../http/network-address.js';

function boolEnv(source: NodeJS.ProcessEnv, name: string, fallback: boolean) {
  const value = source[name];
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function numberEnv(source: NodeJS.ProcessEnv, name: string, fallback: number) {
  const value = Number(source[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function optionalBase64Key(source: NodeJS.ProcessEnv, name: string): Buffer | undefined {
  const value = source[name];
  if (!value) return undefined;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error(`${name} must be base64 for exactly 32 bytes`);
  return decoded;
}

function jsonEnv<T>(source: NodeJS.ProcessEnv, name: string, fallback: T): T {
  const value = source[name];
  return value ? (JSON.parse(value) as T) : fallback;
}

function lowerListEnv(source: NodeJS.ProcessEnv, name: string) {
  return (source[name] ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function corsOrigins(source: NodeJS.ProcessEnv): string[] {
  const raw = source.API_CORS_ORIGINS;
  const values = (raw === undefined ? 'http://127.0.0.1:5173,http://localhost:5173' : raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error('API_CORS_ORIGINS must not be empty');
  if (values.includes('*')) throw new Error('API_CORS_ORIGINS wildcard is not allowed');
  for (const value of values) {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) {
      throw new Error(`API_CORS_ORIGINS contains an invalid origin: ${value}`);
    }
  }
  return [...new Set(values)];
}

export function createEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const host = source.HOST?.trim() || '127.0.0.1';
  const apiRemoteToken = source.API_REMOTE_TOKEN?.trim() || undefined;
  if (!isLoopbackAddress(host) && (!apiRemoteToken || apiRemoteToken.length < 32)) {
    throw new Error('API_REMOTE_TOKEN must contain at least 32 characters for non-loopback HOST');
  }
  const storageDir = source.STORAGE_DIR ?? './storage';

  return {
    appVersion: source.APP_VERSION ?? '2.9.6',
    host,
    port: Number(source.PORT ?? 3000),
    apiCorsOrigins: corsOrigins(source),
    apiRemoteToken,
    storageDir,
    maxChaptersPerRun: numberEnv(source, 'MAX_CHAPTERS_PER_RUN', 50),
    crawlerConcurrency: numberEnv(source, 'CRAWLER_CONCURRENCY', 2),
    crawlerRetry: numberEnv(source, 'CRAWLER_RETRY', 2),
    crawlerDelayMs: numberEnv(source, 'CRAWLER_DELAY_MS', 600),
    requestTimeoutMs: numberEnv(source, 'REQUEST_TIMEOUT_MS', 15000),
    maxHttpResponseBytes: numberEnv(source, 'MAX_HTTP_RESPONSE_BYTES', 20 * 1024 * 1024),
    crawlerRetryBaseDelayMs: numberEnv(source, 'CRAWLER_RETRY_BASE_DELAY_MS', 1000),
    crawlerRetryMaxDelayMs: numberEnv(source, 'CRAWLER_RETRY_MAX_DELAY_MS', 15000),
    maxExportSourceBytes: numberEnv(source, 'MAX_EXPORT_SOURCE_BYTES', 128 * 1024 * 1024),
    minChapterContentChars: numberEnv(source, 'MIN_CHAPTER_CONTENT_CHARS', 200),
    sourceAllowlist: lowerListEnv(source, 'SOURCE_ALLOWLIST'),
    sourceReaderCursorKey:
      source.SOURCE_READER_CURSOR_KEY ?? 'development-only-source-reader-cursor-key-32-bytes',
    sourceReaderMemoryCacheEntries: numberEnv(source, 'SOURCE_READER_MEMORY_CACHE_ENTRIES', 500),
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
    sourceReaderPluginDir: source.SOURCE_READER_PLUGIN_DIR ?? resolve(storageDir, 'source-plugins'),
    sourceReaderTrustedKeys: jsonEnv<
      Array<{ id: string; algorithm: 'ed25519'; publicKeyPem: string }>
    >(source, 'SOURCE_READER_TRUSTED_KEYS_JSON', [])
  };
}

export const env = createEnvironment();
