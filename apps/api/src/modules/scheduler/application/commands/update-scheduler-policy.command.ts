import type { LibraryQueries } from '../../../library/public/library.api.js';
import type { SchedulerRepository } from '../ports/scheduler.repository.js';
import { SchedulerNotFoundError } from '../../domain/scheduler.error.js';
import type { ScheduledNovel, SchedulerPolicy } from '../../domain/scheduler.models.js';
import type { UpdateSchedulerPolicyCommand } from '../../public/scheduler.contracts.js';

function scheduledNovel(
  novel: NonNullable<Awaited<ReturnType<LibraryQueries['getNovel']>>>['novel'],
  policy: SchedulerPolicy
): ScheduledNovel {
  return {
    id: novel.id,
    title: novel.title,
    sourceUrl: novel.sourceUrl,
    sourceName: novel.sourceName,
    status: novel.status,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    autoUpdateEnabled: policy.enabled,
    updateIntervalMinutes: policy.intervalMinutes,
    ...(policy.lastCheckAt ? { lastUpdateCheckAt: policy.lastCheckAt } : {}),
    ...(policy.nextCheckAt ? { nextUpdateCheckAt: policy.nextCheckAt } : {}),
    lastUpdateResult: policy.lastResult,
    consecutiveUpdateFailures: policy.consecutiveFailures
  };
}

export class UpdateSchedulerPolicyCommandHandler {
  constructor(
    private readonly library: LibraryQueries,
    private readonly repository: SchedulerRepository,
    private readonly clock: { now(): Date }
  ) {}

  async execute(command: UpdateSchedulerPolicyCommand): Promise<ScheduledNovel> {
    const detail = await this.library.getNovel(command.novelId);
    if (!detail) throw new SchedulerNotFoundError('Novel not found');
    const now = this.clock.now().toISOString();
    const policy = await this.repository.upsertPolicy({
      novelId: command.novelId,
      enabled: command.enabled,
      intervalMinutes: command.intervalMinutes,
      ...(command.enabled ? { nextCheckAt: now } : {}),
      now
    });
    return scheduledNovel(detail.novel, policy);
  }
}
