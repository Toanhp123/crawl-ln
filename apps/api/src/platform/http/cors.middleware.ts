import type { RequestHandler } from 'express';

class CorsOriginDeniedError extends Error {
  readonly kind = 'forbidden' as const;

  constructor(origin: string) {
    super(`Origin is not allowed: ${origin}`);
    this.name = 'CorsOriginDeniedError';
  }
}

const allowedMethods = 'GET,HEAD,PUT,PATCH,POST,DELETE';

export function corsMiddleware(origins: readonly string[]): RequestHandler {
  const allowlist = new Set(origins);
  return (request, response, next) => {
    const origin = request.header('origin');
    if (origin) {
      if (!allowlist.has(origin)) {
        next(new CorsOriginDeniedError(origin));
        return;
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
    }

    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', allowedMethods);
      const requestedHeaders = request.header('access-control-request-headers');
      if (requestedHeaders) response.setHeader('Access-Control-Allow-Headers', requestedHeaders);
      response.status(204).send();
      return;
    }
    next();
  };
}
