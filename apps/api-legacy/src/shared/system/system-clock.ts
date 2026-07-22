import type { ClockPort } from '../ports/clock.port.js';

export class SystemClock implements ClockPort {
  now() {
    return new Date();
  }
}
