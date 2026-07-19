import type { ApplicationEvent, ApplicationEventHandler } from './application-event.js';

export interface ApplicationEventBusPort {
  publish<TEvent extends ApplicationEvent>(event: TEvent): Promise<void>;
  subscribe<TEvent extends ApplicationEvent>(
    eventName: TEvent['name'],
    handler: ApplicationEventHandler<TEvent>
  ): () => void;
}
