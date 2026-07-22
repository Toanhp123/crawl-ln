import type { LoggerPort } from '../../../../shared/ports/logger.port.js';

export const MAX_MESSAGE_BYTES = 2_048;
export const MAX_METADATA_BYTES = 8_192;
export const MAX_DEPTH = 4;
export const MAX_ARRAY_ITEMS = 20;

const REDACTED = '[REDACTED]';
const OMITTED = '[OMITTED]';
const TRUNCATED = '[TRUNCATED]';

const sensitiveKeys = new Set([
  'password',
  'passphrase',
  'secret',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'set-cookie',
  'otp',
  'code',
  'signature',
  'session',
  'sessionid',
  'proxypassword',
  'proxy_password'
]);

const sensitiveQueryKeys = new Set([
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'auth',
  'authorization',
  'key',
  'signature',
  'session',
  'session_id',
  'code',
  'otp'
]);

const disallowedPluginKeys = new Set(['body', 'html', 'rawhtml', 'content', 'chapter', 'buffer']);

export const ALLOWED_PLUGIN_METADATA_KEYS = new Set([
  'operation',
  'selector',
  'status',
  'durationMs',
  'itemCount',
  'warningCode',
  'url'
]);

export interface PluginLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SourceReaderStructuredLogger {
  host(event: string, metadata: Record<string, unknown>): void;
  plugin(
    trusted: {
      requestId: string;
      pluginId: string;
      pluginVersion: string;
      capability?: string;
    },
    event: PluginLogEvent
  ): { accepted: boolean; violations: string[] };
}

interface SanitizeOptions {
  pluginMetadata: boolean;
  violations: string[];
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return sensitiveKeys.has(key.toLowerCase()) || sensitiveKeys.has(normalized);
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;
  const suffix = `…${TRUNCATED}`;
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  return Buffer.concat([
    bytes.subarray(0, Math.max(0, maxBytes - suffixBytes)),
    Buffer.from(suffix)
  ])
    .toString('utf8')
    .replace(/\uFFFD+$/g, '');
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const [name] of url.searchParams) {
      if (sensitiveQueryKeys.has(name.toLowerCase())) url.searchParams.set(name, REDACTED);
    }
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return REDACTED;
  }
}

function sanitizeValue(
  value: unknown,
  key: string | undefined,
  depth: number,
  options: SanitizeOptions
): unknown {
  if (key && isSensitiveKey(key)) return REDACTED;
  if (depth >= MAX_DEPTH) {
    options.violations.push('metadata-depth-exceeded');
    return TRUNCATED;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    options.violations.push('binary-metadata-omitted');
    return OMITTED;
  }
  if (typeof value === 'string') {
    if (key?.toLowerCase() === 'url') return sanitizeUrl(value);
    if (/<(?:!doctype|html|body|article|section|div|p|script|style)\b/i.test(value)) {
      options.violations.push('html-metadata-omitted');
      return OMITTED;
    }
    return truncateUtf8(value, MAX_METADATA_BYTES);
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') {
    options.violations.push('unsupported-metadata-omitted');
    return OMITTED;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) options.violations.push('metadata-array-truncated');
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, undefined, depth + 1, options));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (options.pluginMetadata) {
        if (isSensitiveKey(childKey)) {
          options.violations.push(`sensitive-key:${childKey}`);
          continue;
        }
        const normalized = normalizeKey(childKey);
        if (disallowedPluginKeys.has(normalized)) {
          options.violations.push(`disallowed-key:${childKey}`);
          continue;
        }
        if (!ALLOWED_PLUGIN_METADATA_KEYS.has(childKey)) {
          options.violations.push(`unknown-key:${childKey}`);
          continue;
        }
      }
      output[childKey] = sanitizeValue(child, childKey, depth + 1, options);
    }
    return output;
  }
  return OMITTED;
}

function sanitizeMessage(value: string, violations: string[]): string {
  let sanitized = value.replace(/https?:\/\/[^\s]+/gi, (url) => sanitizeUrl(url));
  const patterns: RegExp[] = [
    /\b(?:password|passphrase|secret|token|access[_-]?token|refresh[_-]?token|authorization|cookie|session|proxy[_-]?password|otp|code)\b\s*[:=]\s*[^\s,;]+/gi,
    /\bBearer\s+[^\s,;]+/gi,
    /\b(?:sid|sessionid|session_id)=[^\s,;]+/gi
  ];
  for (const pattern of patterns) sanitized = sanitized.replace(pattern, REDACTED);
  if (/<(?:!doctype|html|body|article|section|div|p|script|style)\b/i.test(sanitized)) {
    violations.push('html-message-omitted');
    return OMITTED;
  }
  if (sanitized !== value) violations.push('message-redacted');
  return truncateUtf8(sanitized, MAX_MESSAGE_BYTES);
}

function boundedMetadata(
  metadata: Record<string, unknown>,
  options: SanitizeOptions
): Record<string, unknown> {
  const sanitized = sanitizeValue(metadata, undefined, 0, options) as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') <= MAX_METADATA_BYTES) return sanitized;
  options.violations.push('metadata-bytes-exceeded');
  const bounded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    const candidate = { ...bounded, [key]: value };
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MAX_METADATA_BYTES) break;
    bounded[key] = value;
  }
  return { ...bounded, truncated: true };
}

function write(logger: LoggerPort, level: PluginLogEvent['level'], value: string): void {
  if (level === 'warn') logger.warn(value);
  else if (level === 'error') logger.error(value);
  else logger.info(value);
}

export class BoundedSourceReaderStructuredLogger implements SourceReaderStructuredLogger {
  constructor(private readonly logger: LoggerPort) {}

  host(event: string, metadata: Record<string, unknown>): void {
    const violations: string[] = [];
    const safe = boundedMetadata(metadata, { pluginMetadata: false, violations });
    this.logger.info(
      JSON.stringify({
        ...safe,
        event: truncateUtf8(event, 256),
        ...(violations.length > 0 ? { redactionViolations: [...new Set(violations)] } : {})
      })
    );
  }

  plugin(
    trusted: {
      requestId: string;
      pluginId: string;
      pluginVersion: string;
      capability?: string;
    },
    event: PluginLogEvent
  ): { accepted: boolean; violations: string[] } {
    const violations: string[] = [];
    const metadata = event.metadata
      ? boundedMetadata(event.metadata, { pluginMetadata: true, violations })
      : undefined;
    const payload = JSON.stringify({
      event: 'source_reader.plugin_log',
      requestId: truncateUtf8(trusted.requestId, 256),
      pluginId: truncateUtf8(trusted.pluginId, 256),
      pluginVersion: truncateUtf8(trusted.pluginVersion, 128),
      ...(trusted.capability ? { capability: truncateUtf8(trusted.capability, 128) } : {}),
      level: event.level,
      message: sanitizeMessage(String(event.message), violations),
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(violations.length > 0 ? { policyViolations: [...new Set(violations)] } : {})
    });
    write(this.logger, event.level, payload);
    return { accepted: true, violations: [...new Set(violations)] };
  }
}

export function redactStructuredValue(value: unknown, key?: string): unknown {
  return sanitizeValue(value, key, 0, { pluginMetadata: false, violations: [] });
}
