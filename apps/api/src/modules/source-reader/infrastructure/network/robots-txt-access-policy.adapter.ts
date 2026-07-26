import axios from 'axios';
import type { SourceAccessPolicyPort } from '../../application/ports/source-access-policy.port.js';

const browserUserAgent =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const maxRobotsBytes = 1024 * 1024;

interface RobotsRule {
  directive: 'allow' | 'disallow';
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMs?: number;
}

interface RobotsRules {
  groups: RobotsGroup[];
}

interface RobotsCacheEntry {
  result: { kind: 'rules'; rules: RobotsRules } | { kind: 'unavailable'; reason: string };
  expiresAt: number;
}

interface RobotsLoad {
  controller: AbortController;
  promise: Promise<RobotsCacheEntry>;
  waiters: number;
  settled: boolean;
}

export interface RobotsTextClient {
  get(url: string, options: { timeoutMs: number; signal?: AbortSignal }): Promise<string>;
}

interface RobotsTxtAccessPolicyOptions {
  http: RobotsTextClient;
  sourceAllowlist: readonly string[];
  defaultCrawlDelayMs: number;
  requestTimeoutMs: number;
  now?: () => number;
  successTtlMs?: number;
  failureTtlMs?: number;
}

function normalizedHost(input: string): string {
  return new URL(input).hostname.toLowerCase().replace(/^www\./, '');
}

function comparableHost(input: string): string {
  return input.toLowerCase().replace(/^www\./, '');
}

function hostMatches(host: string, allowedHost: string): boolean {
  const normalizedAllowed = allowedHost.toLowerCase().replace(/^www\./, '');
  return host === normalizedAllowed || host.endsWith(`.${normalizedAllowed}`);
}

function toPattern(path: string): RegExp {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\$$/, '$');
  return new RegExp(`^${escaped}`);
}

function matchesRule(pathname: string, rulePath: string): boolean {
  return rulePath !== '' && toPattern(rulePath).test(pathname);
}

function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0 || current.crawlDelayMs !== undefined) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && value) {
      current.rules.push({ directive: key, path: value });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) current.crawlDelayMs = Math.ceil(seconds * 1000);
    }
  }

  return { groups };
}

function pickBestGroup(rules: RobotsRules): RobotsGroup | undefined {
  const agentName = 'noveltool';
  return (
    rules.groups.find((group) =>
      group.agents.some((candidate) => candidate !== '*' && agentName.includes(candidate))
    ) ?? rules.groups.find((group) => group.agents.includes('*'))
  );
}

function decidePath(group: RobotsGroup | undefined, pathname: string): RobotsRule | undefined {
  return group?.rules
    .filter((rule) => matchesRule(pathname, rule.path))
    .sort((left, right) =>
      right.path.length !== left.path.length
        ? right.path.length - left.path.length
        : left.directive === 'allow'
          ? -1
          : 1
    )[0];
}

function abortError(cause?: unknown): Error {
  const error = new Error('Robots lookup was aborted', { cause });
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError');
}

function waitForLoad<T>(load: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return load;
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener('abort', aborted);
      reject(abortError(signal.reason));
    };
    signal.addEventListener('abort', aborted, { once: true });
    void load.then(
      (value) => {
        signal.removeEventListener('abort', aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      }
    );
  });
}

export class AxiosRobotsTextClient implements RobotsTextClient {
  async get(url: string, options: { timeoutMs: number; signal?: AbortSignal }): Promise<string> {
    const requestedHost = normalizedHost(url);
    const response = await axios.get(url, {
      timeout: options.timeoutMs,
      signal: options.signal,
      maxRedirects: 5,
      maxContentLength: maxRobotsBytes,
      maxBodyLength: maxRobotsBytes,
      beforeRedirect(redirect) {
        const protocol = String(redirect.protocol ?? '').toLowerCase();
        const hostname = comparableHost(String(redirect.hostname ?? redirect.host ?? ''));
        if ((protocol !== 'http:' && protocol !== 'https:') || hostname !== requestedHost) {
          throw new Error('Robots redirect left the approved source host');
        }
      },
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 404 || status === 410,
      headers: {
        'User-Agent': browserUserAgent,
        Accept: 'text/plain,text/*;q=0.9,*/*;q=0.1'
      },
      responseType: 'text',
      transformResponse: [(data) => data]
    });
    if (response.status === 404 || response.status === 410) return '';
    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  }
}

export class RobotsTxtAccessPolicyAdapter implements SourceAccessPolicyPort {
  private readonly cache = new Map<string, RobotsCacheEntry>();
  private readonly loads = new Map<string, RobotsLoad>();
  private readonly now: () => number;
  private readonly successTtlMs: number;
  private readonly failureTtlMs: number;

  constructor(private readonly options: RobotsTxtAccessPolicyOptions) {
    this.now = options.now ?? Date.now;
    this.successTtlMs = options.successTtlMs ?? 60 * 60 * 1000;
    this.failureTtlMs = options.failureTtlMs ?? 60 * 1000;
  }

  async check(
    url: string,
    signal?: AbortSignal
  ): Promise<{ allowed: boolean; reason?: string; crawlDelayMs?: number; retryable?: boolean }> {
    const parsed = new URL(url);
    const host = normalizedHost(url);
    const allowlisted = this.options.sourceAllowlist.some((candidate) =>
      hostMatches(host, candidate)
    );
    if (!allowlisted) return { allowed: false, reason: `Source not allowlisted: ${host}` };

    const entry = await this.getRules(parsed.origin, host, signal);
    if (entry.result.kind === 'unavailable') {
      return { allowed: false, reason: entry.result.reason, retryable: true };
    }
    const rules = entry.result.rules;
    const group = pickBestGroup(rules);
    const rule = decidePath(group, parsed.pathname || '/');
    if (rule?.directive === 'disallow') {
      return { allowed: false, reason: `Blocked by robots.txt: ${rule.path}` };
    }
    return {
      allowed: true,
      crawlDelayMs: group?.crawlDelayMs ?? this.options.defaultCrawlDelayMs
    };
  }

  private async getRules(
    origin: string,
    host: string,
    signal?: AbortSignal
  ): Promise<RobotsCacheEntry> {
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > this.now()) return cached;
    if (cached) this.cache.delete(host);

    let load = this.loads.get(host);
    if (load?.controller.signal.aborted && !load.settled) load = undefined;
    if (!load) {
      load = this.startLoad(origin, host);
      this.loads.set(host, load);
    }
    load.waiters += 1;
    try {
      return await waitForLoad(load.promise, signal);
    } finally {
      load.waiters -= 1;
      if (!load.settled && load.waiters === 0) load.controller.abort();
    }
  }

  private startLoad(origin: string, host: string): RobotsLoad {
    const controller = new AbortController();
    let load!: RobotsLoad;
    const promise = this.loadRules(origin, host, controller.signal).finally(() => {
      load.settled = true;
      if (this.loads.get(host) === load) this.loads.delete(host);
    });
    load = { controller, promise, waiters: 0, settled: false };
    return load;
  }

  private async loadRules(
    origin: string,
    host: string,
    signal: AbortSignal
  ): Promise<RobotsCacheEntry> {
    try {
      const text = await this.options.http.get(`${origin}/robots.txt`, {
        timeoutMs: Math.min(this.options.requestTimeoutMs, 5_000),
        signal
      });
      const rules = parseRobotsTxt(text);
      const entry: RobotsCacheEntry = {
        result: { kind: 'rules', rules },
        expiresAt: this.now() + this.successTtlMs
      };
      this.cache.set(host, entry);
      return entry;
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw abortError(error);
      const entry: RobotsCacheEntry = {
        result: {
          kind: 'unavailable',
          reason: `Robots.txt is temporarily unavailable for ${host}`
        },
        expiresAt: this.now() + this.failureTtlMs
      };
      this.cache.set(host, entry);
      return entry;
    }
  }
}
