export type RobotsDecision = {
  allowed: boolean;
  reason?: string;
  crawlDelayMs?: number;
};
