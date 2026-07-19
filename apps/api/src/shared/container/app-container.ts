import { createBackupModule } from './modules/backup.module.js';
import { createChaptersModule } from './modules/chapters.module.js';
import { createCrawlerModule } from './modules/crawler.module.js';
import { createInfrastructureModule } from './modules/infrastructure.module.js';
import { createExportModule } from './modules/export.module.js';
import { createNovelsModule } from './modules/novels.module.js';
import { createNovelsPersistence } from './modules/novels-persistence.module.js';
import { createSchedulerModule } from './modules/scheduler.module.js';
import { createSearchModule } from './modules/search.module.js';
import { createSourceReaderModule } from './modules/source-reader.module.js';
import { createTasksModule } from './modules/tasks.module.js';
import { RealtimeController } from '../realtime/realtime.controller.js';
import {
  CRAWL_AUDIT_EVENT,
  type CrawlAuditEvent
} from '../../modules/crawler/application/events/crawl-audit.event.js';
import {
  SCHEDULER_DIAGNOSTIC_EVENT,
  type NovelUpdateDiagnosticEvent
} from '../../modules/scheduler/application/events/scheduler-diagnostic.event.js';

export function createAppContainer() {
  const infrastructure = createInfrastructureModule();
  const tasks = createTasksModule(infrastructure);
  const chapters = createChaptersModule(infrastructure);
  const novelsPersistence = createNovelsPersistence(infrastructure, chapters);
  const exports = createExportModule(novelsPersistence);
  const sourceReader = createSourceReaderModule(infrastructure);
  const crawler = createCrawlerModule(
    infrastructure,
    novelsPersistence,
    tasks,
    chapters,
    sourceReader
  );
  const novels = createNovelsModule(infrastructure, chapters, novelsPersistence, crawler, tasks);
  const scheduler = createSchedulerModule(infrastructure, novels, tasks);
  const backups = createBackupModule(infrastructure, crawler, scheduler);
  const search = createSearchModule(infrastructure);

  infrastructure.events.subscribe<CrawlAuditEvent>(CRAWL_AUDIT_EVENT, ({ record }) => {
    const chapterChanged = record.type === 'chapter_succeeded' || record.type === 'chapter_failed';
    const novelChanged =
      chapterChanged || !['chapter_started', 'chapter_retry'].includes(record.type);
    infrastructure.realtime.publish({
      type: 'data.changed',
      resources: [
        'tasks',
        ...(novelChanged ? (['novels'] as const) : []),
        ...(chapterChanged ? (['search'] as const) : [])
      ],
      reason: `crawl.${record.type}`,
      taskId: record.taskId,
      chapterIndex: record.chapterIndex
    });
  });
  infrastructure.events.subscribe<NovelUpdateDiagnosticEvent>(
    SCHEDULER_DIAGNOSTIC_EVENT,
    ({ diagnostic }) => {
      infrastructure.realtime.publish({
        type: 'data.changed',
        resources: ['scheduler', 'novels'],
        reason: `scheduler.${diagnostic.result}`,
        novelId: diagnostic.novelId
      });
    }
  );

  return {
    lifecycle: {
      async start() {
        await sourceReader.lifecycle.start();
        await crawler.api.recoverCrawlJobs.execute();
        scheduler.lifecycle.service.start();
      },
      async stop() {
        await crawler.lifecycle.queue.stop();
        await scheduler.lifecycle.service.stop();
        await sourceReader.lifecycle.stop();
        infrastructure.database.close();
      }
    },
    presentation: {
      realtime: new RealtimeController(infrastructure.realtime),
      novels: novels.presentation.controller,
      chapters: chapters.presentation.controller,
      tasks: tasks.presentation.controller,
      scheduler: scheduler.presentation.controller,
      crawlJobs: crawler.presentation.controller,
      exports: exports.presentation.controller,
      backups: backups.presentation.controller,
      search: search.presentation.controller,
      sourceReader: sourceReader.presentation.controller
    }
  };
}

export type AppContainer = ReturnType<typeof createAppContainer>;
