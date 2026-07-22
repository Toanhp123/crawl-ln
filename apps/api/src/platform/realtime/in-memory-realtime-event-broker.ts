import type {
  RealtimeEvent,
  RealtimeEventInput,
  RealtimeEventPublisher
} from './realtime-event.js';

export type RealtimeEventListener = (event: RealtimeEvent) => void;

export class InMemoryRealtimeEventBroker implements RealtimeEventPublisher {
  private readonly history: RealtimeEvent[] = [];
  private readonly listeners = new Set<RealtimeEventListener>();
  private sequence = 0;
  private readonly historyLimit: number;

  constructor(
    private readonly clock: { now(): Date },
    options: { historyLimit?: number } = {}
  ) {
    this.historyLimit = Math.max(1, options.historyLimit ?? 256);
  }

  publish(input: RealtimeEventInput): RealtimeEvent {
    const event: RealtimeEvent = {
      ...input,
      resources: [...new Set(input.resources)],
      id: String(++this.sequence),
      occurredAt: this.clock.now().toISOString()
    };
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Realtime delivery is best effort and cannot fail the mutation path.
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
