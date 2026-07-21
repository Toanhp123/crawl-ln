import type { RequestHandler } from 'express';
import { fail } from './api-response.js';

export const notFoundMiddleware: RequestHandler = (_request, response) =>
  fail(response, 404, 'NOT_FOUND', 'Route not found');
