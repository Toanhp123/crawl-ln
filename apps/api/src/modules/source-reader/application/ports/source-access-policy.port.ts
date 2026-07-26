export interface SourceAccessDecision {
  allowed: boolean;
  reason?: string;
  crawlDelayMs?: number;
  retryable?: boolean;
}

export interface SourceAccessPolicyPort {
  check(url: string, signal?: AbortSignal): Promise<SourceAccessDecision>;
}
