import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { fail } from './api-response.js';
import { isLoopbackAddress } from './network-address.js';

export interface ApiAccessClassification {
  isLocal: boolean;
  authenticated: boolean;
}

export interface ApiAccessRequest extends Request {
  apiAccess?: ApiAccessClassification;
}

function tokenMatches(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const token = authorization.slice('Bearer '.length).trim();
  return token || undefined;
}

export function apiAccessMiddleware(options: { remoteToken?: string }): RequestHandler {
  return (request: ApiAccessRequest, response: Response, next: NextFunction): void => {
    const isLocal = isLoopbackAddress(request.socket.remoteAddress);
    if (isLocal) {
      request.apiAccess = { isLocal: true, authenticated: true };
      next();
      return;
    }
    if (!tokenMatches(bearerToken(request), options.remoteToken)) {
      request.apiAccess = { isLocal: false, authenticated: false };
      fail(response, 401, 'UNAUTHORIZED', 'Remote API access requires a valid bearer token');
      return;
    }
    request.apiAccess = { isLocal: false, authenticated: true };
    next();
  };
}
