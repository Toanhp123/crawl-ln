import type { ApplicationEvent, ApplicationEventHandler } from '../../events/application-event.js';
import type { ApplicationEventBusPort } from '../../events/application-event-bus.port.js';

export class InMemoryApplicationEventBus implements ApplicationEventBusPort {
  private readonly handlers = new Map<string, Set<ApplicationEventHandler>>();

  async publish<TEvent extends ApplicationEvent>(event: TEvent): Promise<void> {
    const handlers = [...(this.handlers.get(event.name) ?? [])];
    await Promise.all(handlers.map((handler) => handler(event)));
  }

  subscribe<TEvent extends ApplicationEvent>(
    eventName: TEvent['name'],
    handler: ApplicationEventHandler<TEvent>
  ): () => void {
    const handlers = this.handlers.get(eventName) ?? new Set<ApplicationEventHandler>();
    handlers.add(handler as ApplicationEventHandler);
    this.handlers.set(eventName, handlers);
    return () => {
      handlers.delete(handler as ApplicationEventHandler);
      if (!handlers.size) this.handlers.delete(eventName);
    };
  }
}
