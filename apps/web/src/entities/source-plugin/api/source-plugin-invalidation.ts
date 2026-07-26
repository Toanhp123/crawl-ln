import { invalidateQuery, type CollectionInvalidationApi } from '../../../shared/api';
import { sourcePluginKeys } from './source-plugin-keys';

export const sourcePluginInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    invalidateQuery(client, { queryKey: sourcePluginKeys.all }, options)
};
