import type { Request } from 'express';
import type { z } from 'zod';

export function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.body);
}

export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.query);
}

export function parseParams<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.params);
}
