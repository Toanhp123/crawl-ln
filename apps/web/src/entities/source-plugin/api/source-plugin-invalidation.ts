import type { CollectionInvalidationApi } from '../../../shared/api';
import { sourcePluginKeys } from './source-plugin-keys';

export const sourcePluginInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    client.invalidateQueries({ queryKey: sourcePluginKeys.all }, options)
};
