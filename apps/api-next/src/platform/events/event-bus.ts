import type { ApplicationEvent } from './application-event.js';

export interface EventBus {
  publish(event: ApplicationEvent): Promise<void>;
  subscribe<T>(type: string, handler: (event: ApplicationEvent<T>) => Promise<void>): () => void;
}
