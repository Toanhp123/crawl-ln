import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { SourceAccessPolicyPort } from '../ports/source-access-policy.port.js';
import type { SourceRateLimiterPort } from '../ports/source-rate-limiter.port.js';
import type { SourceRequestGatePort } from '../ports/source-request-gate.port.js';

interface AllowedSourceRequest {
  hostKey: string;
  crawlDelayMs: number;
}

function hostKey(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw new SourceReaderError('SOURCE_NOT_SUPPORTED', 'Source URL is invalid', {
      retryable: false,
      fallbackAllowed: false
    });
  }
}

function cancelled(cause?: unknown): SourceReaderError {
  return new SourceReaderError('SOURCE_READER_CANCELLED', 'Source request was cancelled', {
    retryable: false,
    fallbackAllowed: false,
    ...(cause === undefined ? {} : { cause })
  });
}

export class SourceRequestGateService implements SourceRequestGatePort {
  constructor(
    private readonly accessPolicy: SourceAccessPolicyPort,
    private readonly rateLimiter: SourceRateLimiterPort
  ) {}

  async assertAllowed(url: string): Promise<void> {
    await this.requireAllowed(url);
  }

  async enter(url: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw cancelled(signal.reason);
    const request = await this.requireAllowed(url);
    try {
      await this.rateLimiter.wait(request.hostKey, request.crawlDelayMs, signal);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw cancelled(error);
      }
      throw error;
    }
    if (signal?.aborted) throw cancelled(signal.reason);
  }

  private async requireAllowed(url: string): Promise<AllowedSourceRequest> {
    const normalizedHost = hostKey(url);
    const decision = await this.accessPolicy.check(url);
    if (!decision.allowed) {
      const reason = decision.reason ?? 'Source access is denied by policy';
      throw new SourceReaderError('NETWORK_ACCESS_BLOCKED', reason, {
        retryable: false,
        fallbackAllowed: false,
        details: { host: normalizedHost, reason }
      });
    }
    return {
      hostKey: normalizedHost,
      crawlDelayMs:
        decision.crawlDelayMs === undefined || !Number.isFinite(decision.crawlDelayMs)
          ? 0
          : Math.max(0, Math.ceil(decision.crawlDelayMs))
    };
  }
}
