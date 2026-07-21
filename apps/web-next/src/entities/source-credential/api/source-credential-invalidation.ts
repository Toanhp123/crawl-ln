import type { CollectionInvalidationApi } from '../../../shared/api';
import { sourceCredentialKeys } from './source-credential-keys';

export const sourceCredentialInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: sourceCredentialKeys.all })
};
