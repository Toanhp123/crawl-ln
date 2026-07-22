import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type {
  ExecutableSourceCapability,
  SourceReaderCandidate,
  SourceReaderHealthPort
} from '../source-reader.ports.js';

const fallbackCodes = new Set<SourceReaderError['code']>([
  'PLUGIN_UNAVAILABLE',
  'PLUGIN_RESULT_INVALID',
  'PLUGIN_PACKAGE_INVALID',
  'NETWORK_ACCESS_BLOCKED',
  'NETWORK_ROUTE_OFFLINE',
  'NETWORK_ROUTE_UNAVAILABLE',
  'SOURCE_REQUEST_TIMEOUT',
  'SOURCE_RESPONSE_TOO_LARGE',
  'SOURCE_RATE_LIMITED',
  'SOURCE_TEMPORARILY_UNAVAILABLE',
  'UPSTREAM_CHALLENGE_DETECTED'
]);

export class HealthFallbackPolicy {
  constructor(
    private readonly health: SourceReaderHealthPort,
    private readonly clock: { now(): Date }
  ) {}

  now(): number {
    return this.clock.now().getTime();
  }

  async isEligible(
    candidate: SourceReaderCandidate,
    capability: ExecutableSourceCapability
  ): Promise<boolean> {
    try {
      return await this.health.isEligible({ candidate, capability });
    } catch {
      return true;
    }
  }

  async recordSuccess(
    candidate: SourceReaderCandidate,
    capability: ExecutableSourceCapability,
    startedAt: number
  ): Promise<void> {
    try {
      await this.health.recordSuccess({
        candidate,
        capability,
        durationMs: Math.max(0, this.clock.now().getTime() - startedAt)
      });
    } catch {
      // Health telemetry cannot turn a successful source read into a failure.
    }
  }

  async recordFailure(
    candidate: SourceReaderCandidate,
    capability: ExecutableSourceCapability,
    startedAt: number,
    error: unknown
  ): Promise<void> {
    const failureCode =
      error instanceof SourceReaderError
        ? error.code
        : error instanceof Error
          ? error.name
          : 'UNKNOWN_PLUGIN_FAILURE';
    try {
      await this.health.recordFailure({
        candidate,
        capability,
        durationMs: Math.max(0, this.clock.now().getTime() - startedAt),
        failureCode
      });
      if (
        candidate.trustLevel === 'external' &&
        failureCode === 'PLUGIN_PACKAGE_INVALID' &&
        this.health.quarantineIntegrityFailure
      ) {
        await this.health.quarantineIntegrityFailure({ candidate, failureCode });
      }
    } catch {
      // Preserve the original plugin failure and fallback decision.
    }
  }

  allowsFallback(error: unknown): error is SourceReaderError {
    return (
      error instanceof SourceReaderError && error.fallbackAllowed && fallbackCodes.has(error.code)
    );
  }
}
