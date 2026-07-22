import type { CollectionInvalidationApi } from '../../../shared/api';
import { sourcePluginKeys } from './source-plugin-keys';

export const sourcePluginInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: sourcePluginKeys.all })
};
