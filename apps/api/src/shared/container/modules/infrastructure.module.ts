import { env } from '../../config/env.js';
import { createSqliteDatabase } from '../../database/sqlite.js';
import { logger } from '../../logger/logger.js';
import { CryptoIdGenerator } from '../../system/crypto-id-generator.js';
import { SystemClock } from '../../system/system-clock.js';
import { InMemoryApplicationEventBus } from '../../infrastructure/events/in-memory-application-event.bus.js';
import { InMemoryRealtimeEventBroker } from '../../realtime/realtime-event-broker.js';

export function createInfrastructureModule() {
  return {
    database: createSqliteDatabase(),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    logger,
    events: new InMemoryApplicationEventBus(),
    realtime: new InMemoryRealtimeEventBroker(),
    crawlerConfig: {
      maxChaptersPerRun: env.maxChaptersPerRun,
      concurrency: env.crawlerConcurrency,
      retry: env.crawlerRetry,
      retryBaseDelayMs: env.crawlerRetryBaseDelayMs,
      retryMaxDelayMs: env.crawlerRetryMaxDelayMs
    }
  };
}

export type InfrastructureModule = ReturnType<typeof createInfrastructureModule>;
