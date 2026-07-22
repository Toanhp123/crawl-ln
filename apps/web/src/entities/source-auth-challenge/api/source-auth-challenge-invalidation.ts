import type { CollectionInvalidationApi } from '../../../shared/api';
import { sourceAuthChallengeKeys } from './source-auth-challenge-keys';

export const sourceAuthChallengeInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: sourceAuthChallengeKeys.all })
};
