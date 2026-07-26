export interface SourceRateLimiterPort {
  wait(key: string, delayMs: number, signal?: AbortSignal): Promise<void>;
}
