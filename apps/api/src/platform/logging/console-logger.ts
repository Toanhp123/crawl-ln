import type { LoggerPort } from '../events/outbox-dispatcher.js';

export class ConsoleLogger implements LoggerPort {
  error(message: string, metadata?: Record<string, unknown>): void {
    console.error(`[error] ${message}`, metadata ?? {});
  }
}
