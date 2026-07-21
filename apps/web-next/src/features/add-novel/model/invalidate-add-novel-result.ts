import type { QueryClient } from '@tanstack/react-query';
import { novelInvalidation } from '../../../entities/novel';
import { taskInvalidation } from '../../../entities/task';
import type { AddNovelWorkflowResult } from './create-add-novel-workflow';

export async function invalidateAddNovelResult(
  client: QueryClient,
  result: AddNovelWorkflowResult
): Promise<void> {
  await Promise.all([
    novelInvalidation.invalidateAll(client),
    taskInvalidation.invalidateAll(client),
    taskInvalidation.invalidateNovel(client, result.novelId)
  ]);
}
