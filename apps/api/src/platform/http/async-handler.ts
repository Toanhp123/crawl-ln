import type { NextFunction, Request, RequestHandler, Response } from 'express';

type MaybePromise<T> = T | Promise<T>;

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => MaybePromise<unknown>
): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}
