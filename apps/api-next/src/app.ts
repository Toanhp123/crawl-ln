import express, { type Express } from 'express';
import { createAppContainer } from './bootstrap/app-container.js';
import { createBackupRoutes } from './modules/backup/presentation/backup.routes.js';
import { createExportRoutes } from './modules/export/presentation/export.routes.js';
import {
  createIngestionRoutes,
  createTaskRoutes
} from './modules/ingestion/presentation/ingestion.routes.js';
import { createLibraryRoutes } from './modules/library/presentation/library.routes.js';
import {
  createSchedulerNovelRoutes,
  createSchedulerRoutes
} from './modules/scheduler/presentation/scheduler.routes.js';
import { createSearchRoutes } from './modules/search/presentation/search.routes.js';
import { createSourceReaderRoutes } from './modules/source-reader/presentation/source-reader.routes.js';
import { environment, type NextEnvironment } from './platform/config/environment.js';
import { apiAccessMiddleware } from './platform/http/api-access.middleware.js';
import { corsMiddleware } from './platform/http/cors.middleware.js';
import { errorMiddleware } from './platform/http/error.middleware.js';
import { notFoundMiddleware } from './platform/http/not-found.middleware.js';
import { createRealtimeRoutes } from './platform/realtime/realtime.routes.js';
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
  app.use(
    corsMiddleware(
      runtimeEnvironment.apiCorsOrigins ?? ['http://127.0.0.1:5173', 'http://localhost:5173']
    )
  );
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_request, response) => ok(response, { ok: true, name: 'novel-tool' }));
  app.use('/api', apiAccessMiddleware({ remoteToken: runtimeEnvironment.apiRemoteToken }));
  app.use('/api/events', createRealtimeRoutes(container.presentation.realtime));
  app.use('/api/novels', createLibraryRoutes(container.presentation.library.controller));
  app.use('/api/crawl', createIngestionRoutes(container.presentation.ingestion.controller));
  app.use('/api/tasks', createTaskRoutes(container.presentation.ingestion.controller));
  app.use('/api/backups', createBackupRoutes(container.presentation.backups.controller));
  app.use('/api/scheduler', createSchedulerRoutes(container.presentation.scheduler.controller));
  app.use('/api/novels', createSchedulerNovelRoutes(container.presentation.scheduler.controller));
  app.use('/api/exports', createExportRoutes(container.presentation.exports.controller));
  app.use('/api/search', createSearchRoutes(container.presentation.search.controller));
  app.use('/api/source-reader', createSourceReaderRoutes(container.presentation.sourceReader));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return {
    app,
    ready,
    lifecycle: container.lifecycle
  };
}
