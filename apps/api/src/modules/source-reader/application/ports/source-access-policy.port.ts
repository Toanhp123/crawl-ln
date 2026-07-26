export interface SourceAccessDecision {
  allowed: boolean;
  reason?: string;
  crawlDelayMs?: number;
}

export interface SourceAccessPolicyPort {
  check(url: string): Promise<SourceAccessDecision>;
}
