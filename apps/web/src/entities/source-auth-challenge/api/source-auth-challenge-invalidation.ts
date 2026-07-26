import { invalidateQuery, type CollectionInvalidationApi } from '../../../shared/api';
import { sourceAuthChallengeKeys } from './source-auth-challenge-keys';

export const sourceAuthChallengeInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    invalidateQuery(client, { queryKey: sourceAuthChallengeKeys.all }, options)
};
