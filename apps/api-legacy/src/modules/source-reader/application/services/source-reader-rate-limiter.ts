import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

function cancelled(): SourceReaderError {
  return new SourceReaderError('SOURCE_READER_CANCELLED', 'Source Reader request was cancelled', {
    retryable: false,
    fallbackAllowed: false
  });
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      reject(cancelled());
    }
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export interface SourceReaderRateLimiterPort {
  enter(key: string, signal: AbortSignal): Promise<() => void>;
}

export class SourceReaderRateLimiter implements SourceReaderRateLimiterPort {
  private readonly active = new Map<string, number>();
  private readonly lastStartedAt = new Map<string, number>();

  constructor(
    private readonly policy: { maxConcurrent: number; minimumDelayMs: number },
    private readonly clock: ClockPort
  ) {}

  async enter(key: string, signal: AbortSignal): Promise<() => void> {
    while ((this.active.get(key) ?? 0) >= this.policy.maxConcurrent) {
      await delay(25, signal);
    }
    const now = this.clock.now().getTime();
    const wait = Math.max(0, (this.lastStartedAt.get(key) ?? 0) + this.policy.minimumDelayMs - now);
    if (wait > 0) await delay(wait, signal);
    if (signal.aborted) throw cancelled();
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    this.lastStartedAt.set(key, this.clock.now().getTime());
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1));
    };
  }
}
