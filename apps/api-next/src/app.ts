import express, { type Express } from 'express';
import { createAppContainer } from './bootstrap/app-container.js';
import {
  createSchedulerNovelRoutes,
  createSchedulerRoutes
} from './modules/scheduler/presentation/scheduler.routes.js';
import { createSourceReaderRoutes } from './modules/source-reader/presentation/source-reader.routes.js';
import { environment, type NextEnvironment } from './platform/config/environment.js';
import { apiAccessMiddleware } from './platform/http/api-access.middleware.js';
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
  const runtimeEnvironment = options.environment ?? environment;
  const container = createAppContainer(runtimeEnvironment);
  const ready = container.lifecycle.start();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_request, response) => ok(response, { ok: true, name: 'novel-tool' }));
  app.use('/api', apiAccessMiddleware({ remoteToken: runtimeEnvironment.apiRemoteToken }));
  app.use('/api/scheduler', createSchedulerRoutes(container.presentation.scheduler.controller));
  app.use('/api/novels', createSchedulerNovelRoutes(container.presentation.scheduler.controller));
  app.use('/api/source-reader', createSourceReaderRoutes(container.presentation.sourceReader));
  app.use('/api', notFoundMiddleware);
  app.use(errorMiddleware);

  return {
    app,
    ready,
    lifecycle: container.lifecycle
  };
}
