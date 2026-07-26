import type { CollectionInvalidationApi } from '../../../shared/api';
import { sourceAuthChallengeKeys } from './source-auth-challenge-keys';

export const sourceAuthChallengeInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client, options) =>
    client.invalidateQueries({ queryKey: sourceAuthChallengeKeys.all }, options)
};
