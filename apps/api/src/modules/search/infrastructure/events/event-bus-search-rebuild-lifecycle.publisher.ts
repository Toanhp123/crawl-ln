import type { EventBus } from '../../../../platform/events/event-bus.js';
import {
  SEARCH_REBUILD_COMPLETED,
  SEARCH_REBUILD_FAILED,
  SEARCH_REBUILD_STARTED
} from '../../application/events/search-rebuild.event.js';
import type { SearchRebuildLifecyclePublisher } from '../../application/ports/search-rebuild-lifecycle.publisher.js';
import type { SearchIndexRebuildResult } from '../../domain/search.models.js';

export class EventBusSearchRebuildLifecyclePublisher implements SearchRebuildLifecyclePublisher {
  constructor(
    private readonly events: EventBus,
    private readonly clock: { now(): Date },
    private readonly ids: { randomId(): string }
  ) {}

  started(): Promise<void> {
    return this.publish(SEARCH_REBUILD_STARTED, {});
  }

  completed(result: SearchIndexRebuildResult): Promise<void> {
    return this.publish(SEARCH_REBUILD_COMPLETED, result);
  }

  failed(): Promise<void> {
    return this.publish(SEARCH_REBUILD_FAILED, {});
  }

  private publish(type: string, payload: unknown): Promise<void> {
    return this.events.publish({
      id: this.ids.randomId(),
      type,
      occurredAt: this.clock.now().toISOString(),
      payload
    });
  }
}
