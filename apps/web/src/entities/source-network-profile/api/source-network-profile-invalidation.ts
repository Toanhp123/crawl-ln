import type { CollectionInvalidationApi } from '../../../shared/api';
import { sourceNetworkProfileKeys } from './source-network-profile-keys';

export const sourceNetworkProfileInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    client.invalidateQueries({ queryKey: sourceNetworkProfileKeys.all }, options)
};
