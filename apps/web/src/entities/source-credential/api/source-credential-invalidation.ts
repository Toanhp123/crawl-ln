import { invalidateQuery, type CollectionInvalidationApi } from '../../../shared/api';
import { sourceCredentialKeys } from './source-credential-keys';

export const sourceCredentialInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    invalidateQuery(client, { queryKey: sourceCredentialKeys.all }, options)
};
