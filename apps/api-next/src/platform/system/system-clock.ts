import type { ClockPort } from '../events/outbox-dispatcher.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
