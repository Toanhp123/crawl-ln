import type { CorsOptions } from 'cors';

class CorsOriginDeniedError extends Error {
  readonly kind = 'forbidden' as const;

  constructor(origin: string) {
    super(`Origin is not allowed: ${origin}`);
    this.name = 'CorsOriginDeniedError';
  }
}

export function createCorsOptions(origins: readonly string[]): CorsOptions {
  const allowlist = new Set(origins);
  return {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new CorsOriginDeniedError(origin));
    },
    credentials: false,
    optionsSuccessStatus: 204
  };
}
