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

  async assertAllowed(url: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw cancelled(signal.reason);
    try {
      await this.requireAllowed(url, signal);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw cancelled(error);
      }
      throw error;
    }
    if (signal?.aborted) throw cancelled(signal.reason);
  }

  async enter(url: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw cancelled(signal.reason);
    try {
      const request = await this.requireAllowed(url, signal);
      await this.rateLimiter.wait(request.hostKey, request.crawlDelayMs, signal);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw cancelled(error);
      }
      throw error;
    }
    if (signal?.aborted) throw cancelled(signal.reason);
  }

  private async requireAllowed(url: string, signal?: AbortSignal): Promise<AllowedSourceRequest> {
    const normalizedHost = hostKey(url);
    const decision = await this.accessPolicy.check(url, signal);
    if (!decision.allowed) {
      const reason = decision.reason ?? 'Source access is denied by policy';
      const retryable = decision.retryable === true;
      throw new SourceReaderError(
        retryable ? 'SOURCE_TEMPORARILY_UNAVAILABLE' : 'NETWORK_ACCESS_BLOCKED',
        reason,
        {
          retryable,
          fallbackAllowed: false,
          details: { host: normalizedHost, reason }
        }
      );
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
