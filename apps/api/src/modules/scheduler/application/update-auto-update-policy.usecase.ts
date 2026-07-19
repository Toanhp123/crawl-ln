import type { AutoUpdateInterval, Novel } from './models/scheduler-contracts.js';
import type { AutoUpdatePolicyRepository } from './ports/auto-update-policy.repository.js';
import type { ClockPort } from '../../../shared/ports/clock.port.js';
import { SchedulerNotFoundError } from './errors/scheduler.error.js';

export class UpdateAutoUpdatePolicyUseCase {
  constructor(
    private readonly policies: AutoUpdatePolicyRepository,
    private readonly clock: ClockPort
  ) {}

  async execute(id: string, enabled: boolean, intervalMinutes: AutoUpdateInterval): Promise<Novel> {
    const nowIso = this.clock.now().toISOString();
    const novel = await this.policies.updatePolicy(
      id,
      enabled,
      intervalMinutes,
      nowIso,
      enabled ? nowIso : undefined
    );
    if (!novel) throw new SchedulerNotFoundError('Novel not found');
    return novel;
  }
}
