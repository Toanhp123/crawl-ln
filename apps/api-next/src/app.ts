import express, { type Express } from 'express';
import { errorMiddleware } from './platform/http/error.middleware.js';
import { notFoundMiddleware } from './platform/http/not-found.middleware.js';
import { ok } from './platform/http/api-response.js';

export interface NextAppRuntime {
  app: Express;
  ready: Promise<void>;
  lifecycle: { stop(): Promise<void> };
}

export function createNextAppRuntime(): NextAppRuntime {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_request, response) => ok(response, { ok: true, name: 'novel-tool' }));
  app.use('/api', notFoundMiddleware);
  app.use(errorMiddleware);

  return {
    app,
    ready: Promise.resolve(),
    lifecycle: { stop: async () => undefined }
  };
}
