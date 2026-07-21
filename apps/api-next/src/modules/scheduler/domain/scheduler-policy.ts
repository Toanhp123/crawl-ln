import type { AutoUpdateInterval } from './scheduler.models.js';

const intervals = new Set<number>([0, 360, 720, 1440, 10080]);
const failureBackoffMinutes = [5, 15, 30, 120, 1440] as const;

export function assertAutoUpdateInterval(value: number): asserts value is AutoUpdateInterval {
  if (!intervals.has(value)) throw new Error(`Unsupported scheduler interval: ${value}`);
}

export function nextPolicyCheck(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function failureBackoff(failures: number): number {
  return failureBackoffMinutes[
    Math.min(Math.max(1, failures) - 1, failureBackoffMinutes.length - 1)
  ];
}
