import { env } from '../../../../shared/config/env.js';
import type { RateLimiterPort } from '../../application/ports/rate-limiter.port.js';

type RateLimiterOptions = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  minimumDelayMs?: number;
};

export class InMemoryRateLimiterService implements RateLimiterPort {
  private readonly nextAllowedAtByKey = new Map<string, number>();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minimumDelayMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.minimumDelayMs = options.minimumDelayMs ?? env.crawlerDelayMs;
  }

  async wait(key: string, extraDelayMs = 0): Promise<void> {
    const delayMs = Math.max(this.minimumDelayMs, extraDelayMs);
    const now = this.now();
    const scheduledAt = Math.max(now, this.nextAllowedAtByKey.get(key) ?? now);
    this.nextAllowedAtByKey.set(key, scheduledAt + delayMs);
    const waitMs = scheduledAt - now;
    if (waitMs > 0) await this.sleep(waitMs);
  }
}
