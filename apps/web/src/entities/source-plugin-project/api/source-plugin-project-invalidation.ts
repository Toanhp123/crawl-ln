import { invalidateQuery, type CollectionInvalidationApi } from '../../../shared/api';
import { sourcePluginProjectKeys } from './source-plugin-project-keys';

export const sourcePluginProjectInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    invalidateQuery(client, { queryKey: sourcePluginProjectKeys.all }, options)
};
