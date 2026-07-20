import type { LoggerPort } from '../../../../shared/ports/logger.port.js';
import type { SourceReaderObservabilityPort } from '../../application/ports/source-reader-observability.port.js';

import {
  BoundedSourceReaderStructuredLogger,
  redactStructuredValue,
  type SourceReaderStructuredLogger
} from '../../application/services/source-reader-structured-logger.js';

export const redactSourceReaderValue = redactStructuredValue;

type MetricMap = Record<string, number>;

export interface SourceReaderMetricSnapshot {
  source_reader_invocations_total: MetricMap;
  source_reader_invocation_duration_ms: MetricMap;
  source_reader_errors_total: MetricMap;
  source_reader_fallbacks_total: MetricMap;
  source_reader_cache_hits_total: MetricMap;
  source_reader_cache_stale_hits_total: MetricMap;
  source_reader_worker_restarts_total: MetricMap;
  source_reader_auth_challenges_total: MetricMap;
  source_reader_active_sessions: MetricMap;
  source_reader_network_route_health: MetricMap;
}

function increment(metric: MetricMap, key: string, value = 1): void {
  metric[key] = (metric[key] ?? 0) + value;
}

export class InProcessSourceReaderObservability implements SourceReaderObservabilityPort {
  private readonly metrics: SourceReaderMetricSnapshot = {
    source_reader_invocations_total: {},
    source_reader_invocation_duration_ms: {},
    source_reader_errors_total: {},
    source_reader_fallbacks_total: {},
    source_reader_cache_hits_total: {},
    source_reader_cache_stale_hits_total: {},
    source_reader_worker_restarts_total: {},
    source_reader_auth_challenges_total: {},
    source_reader_active_sessions: {},
    source_reader_network_route_health: {}
  };

  private readonly logger: SourceReaderStructuredLogger;

  constructor(logger: LoggerPort | SourceReaderStructuredLogger) {
    this.logger = 'host' in logger ? logger : new BoundedSourceReaderStructuredLogger(logger);
  }

  invocationStarted(
    input: Parameters<SourceReaderObservabilityPort['invocationStarted']>[0]
  ): void {
    this.logger.host('source_reader.invocation_started', {
      requestId: input.requestId,
      invocationId: input.invocationId,
      pluginId: input.pluginId,
      capability: input.capability,
      domain: input.domain,
      runtimeMode: input.runtimeMode
    });
  }

  invocationFinished(
    input: Parameters<SourceReaderObservabilityPort['invocationFinished']>[0]
  ): void {
    const labels = `${input.pluginId}|${input.capability}|${input.result}|${input.runtimeMode}`;
    increment(this.metrics.source_reader_invocations_total, labels);
    increment(this.metrics.source_reader_invocation_duration_ms, labels, input.durationMs);
    if (input.failureCode) {
      increment(
        this.metrics.source_reader_errors_total,
        `${input.pluginId}|${input.capability}|${input.failureCode}|${input.runtimeMode}`
      );
    }
    this.logger.host('source_reader.invocation_finished', {
      requestId: input.requestId,
      invocationId: input.invocationId,
      pluginId: input.pluginId,
      capability: input.capability,
      runtimeMode: input.runtimeMode,
      result: input.result,
      durationMs: input.durationMs,
      ...(input.failureCode ? { failureCode: input.failureCode } : {})
    });
  }

  cacheHit(input: Parameters<SourceReaderObservabilityPort['cacheHit']>[0]): void {
    const labels = `${input.pluginId}|${input.capability}`;
    increment(this.metrics.source_reader_cache_hits_total, labels);
    if (input.stale) increment(this.metrics.source_reader_cache_stale_hits_total, labels);
  }

  fallback(input: Parameters<SourceReaderObservabilityPort['fallback']>[0]): void {
    increment(
      this.metrics.source_reader_fallbacks_total,
      `${input.pluginId}|${input.capability}|${input.failureCode}`
    );
  }

  snapshot(): SourceReaderMetricSnapshot {
    return structuredClone(this.metrics);
  }
}
