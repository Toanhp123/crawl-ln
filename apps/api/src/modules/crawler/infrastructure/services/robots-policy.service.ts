import { env } from '../../../../shared/config/env.js';
import type { RobotsDecision } from '../../domain/entities/crawl-result.entity.js';
import type { RobotsPolicyPort } from '../../application/ports/robots-policy.port.js';
import type { HttpClientPort } from '../../domain/http/http-client.port.js';
import { hostMatches, normalizedHost } from '../../domain/source/url-normalizer.js';

type RobotsRule = {
  directive: 'allow' | 'disallow';
  path: string;
};

type RobotsGroup = {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMs?: number;
};

type RobotsRules = {
  groups: RobotsGroup[];
};

type RobotsCacheEntry = {
  rules: RobotsRules;
  expiresAt: number;
};

type RobotsPolicyOptions = {
  now?: () => number;
  successTtlMs?: number;
  failureTtlMs?: number;
};

function toPattern(path: string) {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\$$/, '$');
  return new RegExp(`^${escaped}`);
}

function matchesRule(pathname: string, rulePath: string) {
  if (rulePath === '') return false;
  return toPattern(rulePath).test(pathname);
}

function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0 || current.crawlDelayMs != null) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && value) {
      current.rules.push({ directive: key, path: value });
    }
    if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) current.crawlDelayMs = Math.ceil(seconds * 1000);
    }
  }

  return { groups };
}

function pickBestGroup(rules: RobotsRules, agentName: string) {
  const agent = agentName.toLowerCase();
  const exact = rules.groups.find((group) =>
    group.agents.some((candidate) => candidate !== '*' && agent.includes(candidate))
  );
  if (exact) return exact;
  return rules.groups.find((group) => group.agents.includes('*')) ?? null;
}

function decidePath(group: RobotsGroup | null, pathname: string) {
  if (!group) return null;
  const matches = group.rules
    .filter((rule) => matchesRule(pathname, rule.path))
    .sort((a, b) => b.path.length - a.path.length || (a.directive === 'allow' ? -1 : 1));
  return matches[0] ?? null;
}

export class RobotsTxtPolicyService implements RobotsPolicyPort {
  private readonly cache = new Map<string, RobotsCacheEntry>();
  private readonly agentName = 'NovelTool';
  private readonly now: () => number;
  private readonly successTtlMs: number;
  private readonly failureTtlMs: number;

  constructor(
    private readonly httpClient: HttpClientPort,
    options: RobotsPolicyOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.successTtlMs = options.successTtlMs ?? 60 * 60 * 1000;
    this.failureTtlMs = options.failureTtlMs ?? 60 * 1000;
  }

  async check(url: string): Promise<RobotsDecision> {
    const parsed = new URL(url);
    const host = normalizedHost(url);
    const allowlisted = env.sourceAllowlist.some((item) => hostMatches(host, item));

    if (!allowlisted) return { allowed: false, reason: `Source not allowlisted: ${host}` };

    const robots = await this.getRules(parsed.origin, host);
    const group = pickBestGroup(robots, this.agentName);
    const rule = decidePath(group, parsed.pathname || '/');
    if (rule?.directive === 'disallow')
      return { allowed: false, reason: `Blocked by robots.txt: ${rule.path}` };

    return { allowed: true, crawlDelayMs: group?.crawlDelayMs ?? env.crawlerDelayMs };
  }

  private async getRules(origin: string, host: string) {
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > this.now()) return cached.rules;
    if (cached) this.cache.delete(host);

    try {
      const response = await this.httpClient.get(`${origin}/robots.txt`, {
        timeoutMs: Math.min(env.requestTimeoutMs, 5000)
      });
      const rules = parseRobotsTxt(response.data);
      this.cache.set(host, { rules, expiresAt: this.now() + this.successTtlMs });
      return rules;
    } catch {
      const rules: RobotsRules = { groups: [] };
      this.cache.set(host, { rules, expiresAt: this.now() + this.failureTtlMs });
      return rules;
    }
  }
}
