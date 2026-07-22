import type { RobotsDecision } from '../../domain/entities/crawl-result.entity.js';

export interface RobotsPolicyPort {
  check(url: string): Promise<RobotsDecision>;
}
