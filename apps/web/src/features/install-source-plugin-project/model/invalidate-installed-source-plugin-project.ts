import type { QueryClient } from '@tanstack/react-query';
import { sourcePluginInvalidation } from '../../../entities/source-plugin';
import { sourcePluginProjectInvalidation } from '../../../entities/source-plugin-project';

export function invalidateInstalledSourcePluginProject(client: QueryClient) {
  return Promise.all([
    sourcePluginProjectInvalidation.invalidateAll(client),
    sourcePluginInvalidation.invalidateAll(client)
  ]);
}
