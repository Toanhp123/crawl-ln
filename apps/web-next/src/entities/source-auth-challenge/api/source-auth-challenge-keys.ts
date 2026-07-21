export const sourceAuthChallengeKeys = {
  all: ['source-reader', 'auth-challenges'] as const,
  list: () => ['source-reader', 'auth-challenges'] as const,
  detail: (challengeId: string) => ['source-reader', 'auth-challenges', challengeId] as const
};
