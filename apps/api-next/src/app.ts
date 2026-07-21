import express, { type Express } from 'express';
import { createAppContainer } from './bootstrap/app-container.js';
import { environment, type NextEnvironment } from './platform/config/environment.js';
import { errorMiddleware } from './platform/http/error.middleware.js';
import { notFoundMiddleware } from './platform/http/not-found.middleware.js';
import { ok } from './platform/http/api-response.js';

export interface NextAppRuntime {
  app: Express;
  ready: Promise<void>;
  lifecycle: { stop(): Promise<void> };
}

export function createNextAppRuntime(
  options: { environment?: NextEnvironment } = {}
): NextAppRuntime {
  const app = express();
  const container = createAppContainer(options.environment ?? environment);
  const ready = container.lifecycle.start();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_request, response) => ok(response, { ok: true, name: 'novel-tool' }));
  app.use('/api', notFoundMiddleware);
  app.use(errorMiddleware);

  return {
    app,
    ready,
    lifecycle: container.lifecycle
  };
}
