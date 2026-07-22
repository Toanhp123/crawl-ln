import type { ApplicationEvent } from './application-event.js';

export interface OutboxSource {
  claimBatch(limit: number): Promise<ApplicationEvent[]>;
  markDelivered(ids: string[], deliveredAt: string): Promise<void>;
}
