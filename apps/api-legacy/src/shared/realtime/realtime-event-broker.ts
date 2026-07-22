import type { RealtimeEvent, RealtimeEventInput } from '@novel-tool/shared';

export type RealtimeEventListener = (event: RealtimeEvent) => void;

export interface RealtimeEventPublisher {
  publish(input: RealtimeEventInput): RealtimeEvent;
}

export class InMemoryRealtimeEventBroker implements RealtimeEventPublisher {
  private readonly history: RealtimeEvent[] = [];
  private readonly listeners = new Set<RealtimeEventListener>();
  private sequence = 0;
  private readonly historyLimit: number;
  private readonly now: () => string;

  constructor(options: { historyLimit?: number; now?: () => string } = {}) {
    this.historyLimit = Math.max(1, options.historyLimit ?? 256);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  publish(input: RealtimeEventInput): RealtimeEvent {
    const event: RealtimeEvent = {
      ...input,
      resources: [...new Set(input.resources)],
      id: String(++this.sequence),
      occurredAt: this.now()
    };
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Realtime delivery is best effort and must never fail the REST mutation path.
      }
    }
    return event;
  }

  subscribe(listener: RealtimeEventListener, lastEventId?: string): () => void {
    const lastSequence = Number.parseInt(lastEventId ?? '', 10);
    if (Number.isFinite(lastSequence)) {
      for (const event of this.history) {
        if (Number.parseInt(event.id, 10) > lastSequence) listener(event);
      }
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
