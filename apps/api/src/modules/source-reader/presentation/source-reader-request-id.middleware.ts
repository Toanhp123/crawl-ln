import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SourceReaderRequest } from './source-reader-actor.middleware.js';

export function sourceReaderRequestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const requestId = request.header('x-request-id') || randomUUID();
  (request as SourceReaderRequest).sourceReaderRequestId = requestId;
  response.locals.sourceReaderRequestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
