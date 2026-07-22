import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeEvent, RealtimeResource } from '@novel-tool/shared';
import { novelInvalidation, type NovelInvalidationApi } from '../../entities/novel';
import { schedulerInvalidation, type SchedulerInvalidationApi } from '../../entities/scheduler';
import { searchInvalidation, type SearchInvalidationApi } from '../../entities/search';
import { sourceAuthChallengeInvalidation } from '../../entities/source-auth-challenge';
import { sourceCredentialInvalidation } from '../../entities/source-credential';
import { sourceNetworkProfileInvalidation } from '../../entities/source-network-profile';
import { sourcePluginInvalidation } from '../../entities/source-plugin';
import { taskInvalidation, type TaskInvalidationApi } from '../../entities/task';
import type { CollectionInvalidationApi } from '../../shared/api';

const realtimeResources = new Set<RealtimeResource>([
  'novels',
  'tasks',
  'scheduler',
  'plugins',
  'search',
  'all'
]);

export interface RealtimeInvalidationRegistry {
  tasks: Pick<TaskInvalidationApi, 'invalidateAll' | 'invalidateDetail' | 'invalidateForNovel'>;
  novels: Pick<NovelInvalidationApi, 'invalidateList' | 'invalidateStats' | 'invalidateDetail'>;
  scheduler: Pick<
    SchedulerInvalidationApi,
    'invalidateStatus' | 'invalidateDiagnostics' | 'invalidateNovelDiagnostics'
  >;
  search: Pick<SearchInvalidationApi, 'invalidateAll'>;
  sourceReader: CollectionInvalidationApi;
}

export interface RealtimeErrorMetadata {
  eventId?: string;
  errorClass: string;
}

export class RealtimeEventParseError extends Error {
  readonly eventId?: string;

  constructor(eventId?: string) {
    super('Invalid realtime event');
    this.name = 'RealtimeEventParseError';
    this.eventId = eventId;
  }
}

function candidateEventId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

export function decodeRealtimeEvent(value: unknown): RealtimeEvent {
  const eventId = candidateEventId(value);
  if (typeof value !== 'object' || value === null) throw new RealtimeEventParseError(eventId);

  const candidate = value as Partial<RealtimeEvent>;
  if (
    typeof candidate.id !== 'string' ||
    candidate.type !== 'data.changed' ||
    !Array.isArray(candidate.resources) ||
    candidate.resources.length === 0 ||
    !candidate.resources.every(
      (resource): resource is RealtimeResource =>
        typeof resource === 'string' && realtimeResources.has(resource as RealtimeResource)
    ) ||
    typeof candidate.reason !== 'string' ||
    typeof candidate.occurredAt !== 'string' ||
    !isOptionalString(candidate.taskId) ||
    !isOptionalString(candidate.novelId) ||
    !isOptionalNumber(candidate.chapterIndex)
  ) {
    throw new RealtimeEventParseError(eventId);
  }

  return candidate as RealtimeEvent;
}

export function getRealtimeErrorMetadata(error: unknown): RealtimeErrorMetadata {
  return {
    ...(error instanceof RealtimeEventParseError && error.eventId
      ? { eventId: error.eventId }
      : {}),
    errorClass:
      error instanceof Error && error.name
        ? error.name
        : typeof error === 'object' && error !== null
          ? 'UnknownError'
          : typeof error
  };
}

export function createRealtimeInvalidationRegistry(): RealtimeInvalidationRegistry {
  return {
    tasks: taskInvalidation,
    novels: novelInvalidation,
    scheduler: schedulerInvalidation,
    search: searchInvalidation,
    sourceReader: {
      async invalidateAll(client) {
        await Promise.all([
          sourcePluginInvalidation.invalidateAll(client),
          sourceCredentialInvalidation.invalidateAll(client),
          sourceNetworkProfileInvalidation.invalidateAll(client),
          sourceAuthChallengeInvalidation.invalidateAll(client)
        ]);
      }
    }
  };
}

export async function routeRealtimeEvents(
  events: readonly RealtimeEvent[],
  registry: RealtimeInvalidationRegistry,
  client: QueryClient
): Promise<void> {
  const resources = new Set<RealtimeResource>();
  const taskIds = new Set<string>();
  const novelIds = new Set<string>();

  for (const event of events) {
    for (const resource of event.resources) resources.add(resource);
    if (event.taskId) taskIds.add(event.taskId);
    if (event.novelId) novelIds.add(event.novelId);
  }

  if (resources.has('all')) {
    await client.invalidateQueries();
    return;
  }

  const invalidations: Promise<unknown>[] = [];

  if (resources.has('tasks')) {
    invalidations.push(registry.tasks.invalidateAll(client));
    for (const taskId of taskIds) {
      invalidations.push(registry.tasks.invalidateDetail(client, taskId));
    }
    for (const novelId of novelIds) {
      invalidations.push(registry.tasks.invalidateForNovel(client, novelId));
    }
  }

  if (resources.has('novels')) {
    invalidations.push(registry.novels.invalidateList(client));
    invalidations.push(registry.novels.invalidateStats(client));
    for (const novelId of novelIds) {
      invalidations.push(registry.novels.invalidateDetail(client, novelId));
    }
  }

  if (resources.has('scheduler')) {
    invalidations.push(registry.scheduler.invalidateStatus(client));
    invalidations.push(registry.scheduler.invalidateDiagnostics(client));
    for (const novelId of novelIds) {
      invalidations.push(registry.scheduler.invalidateNovelDiagnostics(client, novelId));
    }
  }

  if (resources.has('search')) invalidations.push(registry.search.invalidateAll(client));
  if (resources.has('plugins')) invalidations.push(registry.sourceReader.invalidateAll(client));

  await Promise.all(invalidations);
}

export function routeRealtimeEvent(
  event: RealtimeEvent,
  registry: RealtimeInvalidationRegistry,
  client: QueryClient
): Promise<void> {
  return routeRealtimeEvents([event], registry, client);
}
