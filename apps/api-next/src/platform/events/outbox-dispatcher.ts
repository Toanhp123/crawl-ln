import type { EventBus } from './event-bus.js';
import type { OutboxSource } from './outbox-source.js';

export interface ClockPort {
  now(): Date;
}

export interface LoggerPort {
  error(message: string, metadata?: Record<string, unknown>): void;
}

export class OutboxDispatcher {
  private readonly batchSize: number;
  private timer?: NodeJS.Timeout;
  private activeTick?: Promise<number>;

  constructor(
    private readonly sources: OutboxSource[],
    private readonly bus: EventBus,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    options: { batchSize?: number } = {}
  ) {
    this.batchSize = options.batchSize ?? 50;
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
      throw new Error('Outbox batch size must be a positive integer');
    }
  }

  async tick(): Promise<number> {
    if (this.activeTick) return this.activeTick;
    const running = this.dispatch();
    this.activeTick = running;
    try {
      return await running;
    } finally {
      if (this.activeTick === running) this.activeTick = undefined;
    }
  }

  start(intervalMs = 1_000): void {
    if (this.timer) return;
    if (!Number.isFinite(intervalMs) || intervalMs < 1) {
      throw new Error('Outbox interval must be a positive number');
    }
    this.timer = setInterval(() => {
      void this.tick().catch((error) => this.logFailure(error, {}));
    }, intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activeTick;
  }

  private async dispatch(): Promise<number> {
    let delivered = 0;

    for (const [sourceIndex, source] of this.sources.entries()) {
      let events;
      try {
        events = (await source.claimBatch(this.batchSize)).slice(0, this.batchSize);
      } catch (error) {
        this.logFailure(error, { sourceIndex });
        continue;
      }

      for (const event of events) {
        try {
          await this.bus.publish(event);
          await source.markDelivered([event.id], this.clock.now().toISOString());
          delivered += 1;
        } catch (error) {
          this.logFailure(error, {
            sourceIndex,
            eventId: event.id,
            eventType: event.type
          });
          break;
        }
      }
    }

    return delivered;
  }

  private logFailure(error: unknown, metadata: Record<string, unknown>): void {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 256);
    try {
      this.logger.error('Outbox dispatch failed', { ...metadata, errorName, errorMessage });
    } catch {
      // Logging must not make the recoverable dispatcher fail permanently.
    }
  }
}
