export interface RateLimiterPort {
  wait(key: string, extraDelayMs?: number): Promise<void>;
}
