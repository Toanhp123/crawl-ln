import 'dotenv/config';

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
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
  genericHtmlAdapterEnabled: boolEnv('GENERIC_HTML_ADAPTER_ENABLED', false),
  sourceProfilesFile: process.env.SOURCE_PROFILES_FILE ?? './config/source-profiles.json',
  sourcesDir: process.env.SOURCES_DIR ?? './sources',
  sourceReaderCursorKey:
    process.env.SOURCE_READER_CURSOR_KEY ?? 'development-only-source-reader-cursor-key-32-bytes',
  sourceReaderMemoryCacheEntries: numberEnv('SOURCE_READER_MEMORY_CACHE_ENTRIES', 500)
};
