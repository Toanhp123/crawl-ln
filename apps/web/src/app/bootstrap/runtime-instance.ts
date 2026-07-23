import type { RuntimeInstance } from '@novel-tool/shared';
import { http } from '@/shared/api';
import { synchronizeNovelToolStorage } from '@/shared/storage';

export async function synchronizeRuntimeInstance(): Promise<RuntimeInstance> {
  const instance = await http<RuntimeInstance>('/api/runtime');
  await synchronizeNovelToolStorage({ currentInstanceId: instance.instanceId });
  return instance;
}
