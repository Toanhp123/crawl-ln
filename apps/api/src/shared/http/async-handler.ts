import type { NextFunction, Request, RequestHandler, Response } from 'express';

type MaybePromise<T> = T | Promise<T>;

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => MaybePromise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
