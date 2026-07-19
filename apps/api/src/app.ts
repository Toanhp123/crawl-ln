import express from 'express';
import cors from 'cors';
import { createNovelRoutes } from './modules/novels/presentation/routes/novel.routes.js';
import { createChapterRoutes } from './modules/chapters/presentation/routes/chapter.routes.js';
import { createSchedulerNovelRoutes } from './modules/scheduler/presentation/scheduler-novel.routes.js';
import { createTaskRoutes } from './modules/task/presentation/routes/task.routes.js';
import { createCrawlRoutes } from './modules/crawler/presentation/routes/crawl.routes.js';
import { createSchedulerRoutes } from './modules/scheduler/presentation/scheduler.routes.js';
import { createBackupRoutes } from './modules/backup/presentation/routes/backup.routes.js';
import { createExportRoutes } from './modules/export/presentation/routes/export.routes.js';
import { createSourcePluginRoutes } from './modules/plugin/presentation/routes/source-plugin.routes.js';
import { createSearchRoutes } from './modules/search/presentation/routes/search.routes.js';
import { createSourceReaderRoutes } from './modules/source-reader/presentation/routes/source-reader.routes.js';
import { createAppContainer } from './shared/container/app-container.js';
import { notFoundMiddleware } from './shared/http/not-found-middleware.js';
import { errorMiddleware } from './app/http/error-middleware.js';
import { ok } from './shared/http/api-response.js';
import { createRealtimeRoutes } from './shared/realtime/realtime.routes.js';

export function createAppRuntime(options: { startBackgroundServices?: boolean } = {}) {
  const app = express();
  const container = createAppContainer();
  const ready =
    (options.startBackgroundServices ?? true) ? container.lifecycle.start() : Promise.resolve();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => ok(res, { ok: true, name: 'novel-tool' }));
  app.use('/api/events', createRealtimeRoutes(container.presentation.realtime));
  app.use('/api/novels', createNovelRoutes(container.presentation.novels));
  app.use('/api/novels', createChapterRoutes(container.presentation.chapters));
  app.use('/api/novels', createSchedulerNovelRoutes(container.presentation.scheduler));
  app.use('/api/crawl', createCrawlRoutes(container.presentation.crawlJobs));
  app.use('/api/tasks', createTaskRoutes(container.presentation.tasks));
  app.use('/api/scheduler', createSchedulerRoutes(container.presentation.scheduler));
  app.use('/api/exports', createExportRoutes(container.presentation.exports));
  app.use('/api/backups', createBackupRoutes(container.presentation.backups));
  app.use('/api/plugins', createSourcePluginRoutes(container.presentation.plugins));
  app.use('/api/search', createSearchRoutes(container.presentation.search));
  app.use('/api/source-reader', createSourceReaderRoutes(container.presentation.sourceReader));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return { app, lifecycle: container.lifecycle, ready };
}

export function createApp(options: { startBackgroundServices?: boolean } = {}) {
  return createAppRuntime(options).app;
}
