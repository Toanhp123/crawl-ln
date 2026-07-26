import type { SourceRateLimiterPort } from '../../application/ports/source-rate-limiter.port.js';

interface SourceRateLimiterOptions {
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function abortError(): Error {
  const error = new Error('Source rate limit wait was aborted');
  error.name = 'AbortError';
  return error;
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      reject(abortError());
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

export class InMemorySourceRateLimiterService implements SourceRateLimiterPort {
  private readonly lastStartedAtByKey = new Map<string, number>();
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: SourceRateLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? abortableSleep;
  }

  async wait(key: string, delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError();
    const normalizedDelayMs = Number.isFinite(delayMs) ? Math.max(0, Math.ceil(delayMs)) : 0;
    const now = this.now();
    const lastStartedAt = this.lastStartedAtByKey.get(key);
    const scheduledAt =
      lastStartedAt === undefined ? now : Math.max(now, lastStartedAt + normalizedDelayMs);
    this.lastStartedAtByKey.set(key, scheduledAt);
    const waitMs = scheduledAt - now;
    if (waitMs > 0) await this.sleep(waitMs, signal);
    if (signal?.aborted) throw abortError();
  }
}
