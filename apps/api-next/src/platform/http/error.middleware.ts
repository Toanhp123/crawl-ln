import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { fail } from './api-response.js';

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    return fail(response, 400, 'VALIDATION_ERROR', 'Validation failed', error.issues);
  }

  return fail(response, 500, 'INTERNAL_ERROR', 'Internal server error');
};
