import axios from 'axios';
import type { SourceAccessPolicyPort } from '../application/services/source-policy.service.js';

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
  rules: RobotsRules;
  expiresAt: number;
}

export interface RobotsTextClient {
  get(url: string, options: { timeoutMs: number }): Promise<string>;
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
      if (Number.isFinite(seconds) && seconds > 0) {
        current.crawlDelayMs = Math.ceil(seconds * 1000);
      }
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

export class AxiosRobotsTextClient implements RobotsTextClient {
  async get(url: string, options: { timeoutMs: number }): Promise<string> {
    const response = await axios.get(url, {
      timeout: options.timeoutMs,
      maxRedirects: 0,
      maxContentLength: maxRobotsBytes,
      maxBodyLength: maxRobotsBytes,
      validateStatus: (status) => status >= 200 && status < 300,
      headers: {
        'User-Agent': browserUserAgent,
        Accept: 'text/plain,text/*;q=0.9,*/*;q=0.1'
      },
      responseType: 'text',
      transformResponse: [(data) => data]
    });
    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  }
}

export class RobotsTxtAccessPolicyAdapter implements SourceAccessPolicyPort {
  private readonly cache = new Map<string, RobotsCacheEntry>();
  private readonly now: () => number;
  private readonly successTtlMs: number;
  private readonly failureTtlMs: number;

  constructor(private readonly options: RobotsTxtAccessPolicyOptions) {
    this.now = options.now ?? Date.now;
    this.successTtlMs = options.successTtlMs ?? 60 * 60 * 1000;
    this.failureTtlMs = options.failureTtlMs ?? 60 * 1000;
  }

  async check(url: string): Promise<{ allowed: boolean; reason?: string; crawlDelayMs?: number }> {
    const parsed = new URL(url);
    const host = normalizedHost(url);
    const allowlisted = this.options.sourceAllowlist.some((candidate) =>
      hostMatches(host, candidate)
    );
    if (!allowlisted) return { allowed: false, reason: `Source not allowlisted: ${host}` };

    const rules = await this.getRules(parsed.origin, host);
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

  private async getRules(origin: string, host: string): Promise<RobotsRules> {
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > this.now()) return cached.rules;
    if (cached) this.cache.delete(host);

    try {
      const text = await this.options.http.get(`${origin}/robots.txt`, {
        timeoutMs: Math.min(this.options.requestTimeoutMs, 5_000)
      });
      const rules = parseRobotsTxt(text);
      this.cache.set(host, { rules, expiresAt: this.now() + this.successTtlMs });
      return rules;
    } catch {
      const rules: RobotsRules = { groups: [] };
      this.cache.set(host, { rules, expiresAt: this.now() + this.failureTtlMs });
      return rules;
    }
  }
}
