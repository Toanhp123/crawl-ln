import type { RequestHandler } from 'express';
import { fail } from './api-response.js';
export const notFoundMiddleware: RequestHandler = (_req, res) =>
  fail(res, 404, 'NOT_FOUND', 'Route not found');
