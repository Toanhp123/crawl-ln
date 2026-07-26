import { invalidateQuery, type CollectionInvalidationApi } from '../../../shared/api';
import { sourceNetworkProfileKeys } from './source-network-profile-keys';

export const sourceNetworkProfileInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    invalidateQuery(client, { queryKey: sourceNetworkProfileKeys.all }, options)
};
