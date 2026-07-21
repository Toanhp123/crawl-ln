import type { ApplicationEvent } from './application-event.js';
import type { EventBus } from './event-bus.js';

type EventHandler = (event: ApplicationEvent) => Promise<void>;

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish(event: ApplicationEvent): Promise<void> {
    for (const handler of [...(this.handlers.get(event.type) ?? [])]) {
      await handler(event);
    }
  }

  subscribe<T>(type: string, handler: (event: ApplicationEvent<T>) => Promise<void>): () => void {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    const registered = handler as EventHandler;
    handlers.add(registered);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(registered);
      if (handlers.size === 0) this.handlers.delete(type);
    };
  }
}
