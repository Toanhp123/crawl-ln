import type { AutoUpdateInterval } from '@novel-tool/shared';
import type { Novel } from '../../../entities/novel';
import { http } from '../../../shared/api';

export interface UpdateAutoUpdateInput {
  novelId: string;
  enabled: boolean;
  intervalMinutes: AutoUpdateInterval;
}

export function updateAutoUpdate(input: UpdateAutoUpdateInput): Promise<Novel> {
  return http<Novel>(`/api/novels/${encodeURIComponent(input.novelId)}/auto-update`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: input.enabled, intervalMinutes: input.intervalMinutes })
  });
}
