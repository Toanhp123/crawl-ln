import { CrawlJobRunnerService } from '../../../modules/crawler/application/services/crawl-job-runner.service.js';
import { CrawlProgressService } from '../../../modules/crawler/application/services/crawl-progress.service.js';
import { CrawlQueueService } from '../../../modules/crawler/application/services/crawl-queue.service.js';
import { CrawlerEngineService } from '../../../modules/crawler/application/services/crawler-engine.service.js';
import { SourceDetectorService } from '../../../modules/crawler/application/services/source-detector.service.js';
import { AnalyzeSourceUseCase } from '../../../modules/crawler/application/use-cases/analyze-source.usecase.js';
import { CancelCrawlJobUseCase } from '../../../modules/crawler/application/use-cases/cancel-crawl-job.usecase.js';
import { CreateCrawlJobUseCase } from '../../../modules/crawler/application/use-cases/create-crawl-job.usecase.js';
import { FetchChapterUseCase } from '../../../modules/crawler/application/use-cases/fetch-chapter.usecase.js';
import { ListCrawlEventsUseCase } from '../../../modules/crawler/application/use-cases/list-crawl-events.usecase.js';
import { PauseCrawlJobUseCase } from '../../../modules/crawler/application/use-cases/pause-crawl-job.usecase.js';
import { RecoverCrawlJobsUseCase } from '../../../modules/crawler/application/use-cases/recover-crawl-jobs.usecase.js';
import { ResumeCrawlJobUseCase } from '../../../modules/crawler/application/use-cases/resume-crawl-job.usecase.js';
import { ResumeCrawlJobsUseCase } from '../../../modules/crawler/application/use-cases/resume-crawl-jobs.usecase.js';
import { ListSourceProfilesUseCase } from '../../../modules/crawler/application/use-cases/source-profiles/list-source-profiles.usecase.js';
import { AxiosHttpClientAdapter } from '../../infrastructure/http/axios-http-client.adapter.js';
import { CheerioHtmlParserAdapter } from '../../infrastructure/html/cheerio-html-parser.adapter.js';
import { InMemoryRateLimiterService } from '../../../modules/crawler/infrastructure/services/rate-limiter.service.js';
import { RobotsTxtPolicyService } from '../../../modules/crawler/infrastructure/services/robots-policy.service.js';
import { JsonSourceProfileRepository } from '../../../modules/crawler/infrastructure/source/json-source-profile.repository.js';
import { SelectorHtmlAdapter } from '../../../modules/crawler/infrastructure/sources/selector-html.adapter.js';
import { CrawlEventSqliteRepository } from '../../../modules/crawler/infrastructure/sqlite/crawl-event-sqlite.repository.js';
import { CrawlRunSqliteUnitOfWork } from '../../database/crawl-run-sqlite.unit-of-work.js';
import { CrawlJobController } from '../../../modules/crawler/presentation/controllers/crawl-job.controller.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { NovelsPersistence } from './novels-persistence.module.js';
import type { TasksModule } from './tasks.module.js';
import type { ChaptersModule } from './chapters.module.js';
import type { PluginModule } from './plugin.module.js';
import { PluginSourceAdapter } from '../../../modules/crawler/infrastructure/sources/plugin-source.adapter.js';
import type { CrawlerApi, CrawlerLifecycle } from '../../../modules/crawler/public/crawler.api.js';
import { ApplicationEventCrawlAuditPublisher } from '../../../modules/crawler/infrastructure/events/application-event-crawl-audit.publisher.js';
import { RecordCrawlAuditHandler } from '../../../modules/crawler/application/handlers/record-crawl-audit.handler.js';
import {
  CRAWL_AUDIT_EVENT,
  type CrawlAuditEvent
} from '../../../modules/crawler/application/events/crawl-audit.event.js';

export function createCrawlerModule(
  infrastructure: InfrastructureModule,
  novels: NovelsPersistence,
  tasks: TasksModule,
  chapters: ChaptersModule,
  plugins: PluginModule
) {
  const crawlEvents = new CrawlEventSqliteRepository(infrastructure.database);
  const crawlAuditHandler = new RecordCrawlAuditHandler(crawlEvents);
  infrastructure.events.subscribe<CrawlAuditEvent>(CRAWL_AUDIT_EVENT, (event) =>
    crawlAuditHandler.handle(event)
  );
  const crawlAuditPublisher = new ApplicationEventCrawlAuditPublisher(infrastructure.events);
  const taskGateway = tasks.api.lifecycle;
  const novelGateway = novels.api.crawlLifecycle;

  const httpClient = new AxiosHttpClientAdapter();
  const htmlParser = new CheerioHtmlParserAdapter();
  const sourceProfiles = new JsonSourceProfileRepository();
  const sourceDetector = new SourceDetectorService(sourceProfiles);
  const crawlerEngine = new CrawlerEngineService(sourceDetector, httpClient, htmlParser);
  const sourceAdapters = [
    new PluginSourceAdapter(plugins.api.registry),
    new SelectorHtmlAdapter(sourceDetector, crawlerEngine)
  ];
  const robotsPolicy = new RobotsTxtPolicyService(httpClient);
  const rateLimiter = new InMemoryRateLimiterService();
  const analyzeSource = new AnalyzeSourceUseCase(sourceAdapters, robotsPolicy);
  const fetchChapter = new FetchChapterUseCase(sourceAdapters, robotsPolicy, rateLimiter);
  const crawlProgress = new CrawlProgressService();
  const crawlPersistence = new CrawlRunSqliteUnitOfWork(
    infrastructure.database,
    chapters.persistence.crawlWriter,
    tasks.persistence.crawlWriter,
    novels.persistence.crawlWriter
  );
  const crawlJobRunner = new CrawlJobRunnerService(
    novelGateway,
    taskGateway,
    crawlAuditPublisher,
    fetchChapter,
    infrastructure.crawlerConfig,
    infrastructure.clock,
    infrastructure.ids,
    crawlProgress,
    crawlPersistence
  );
  const crawlQueue = new CrawlQueueService(
    taskGateway,
    crawlJobRunner,
    infrastructure.clock,
    infrastructure.logger
  );
  const createCrawlJob = new CreateCrawlJobUseCase(
    novelGateway,
    taskGateway,
    crawlAuditPublisher,
    crawlQueue,
    infrastructure.ids,
    infrastructure.clock,
    infrastructure.crawlerConfig
  );
  const cancelCrawlJob = new CancelCrawlJobUseCase(taskGateway, crawlQueue);
  const pauseCrawlJob = new PauseCrawlJobUseCase(taskGateway, crawlQueue);
  const resumeCrawlJob = new ResumeCrawlJobUseCase(taskGateway, crawlQueue);
  const resumeCrawlJobs = new ResumeCrawlJobsUseCase(taskGateway, crawlQueue);
  const listCrawlEvents = new ListCrawlEventsUseCase(taskGateway, crawlEvents);
  const recoverCrawlJobs = new RecoverCrawlJobsUseCase(
    taskGateway,
    crawlAuditPublisher,
    infrastructure.clock,
    infrastructure.ids
  );
  const listSourceProfiles = new ListSourceProfilesUseCase(sourceProfiles);

  const api = { analyzeSource, createCrawlJob, recoverCrawlJobs } satisfies CrawlerApi;
  const lifecycle = { queue: crawlQueue } satisfies CrawlerLifecycle;

  return {
    api,
    presentation: {
      controller: new CrawlJobController(
        createCrawlJob,
        cancelCrawlJob,
        pauseCrawlJob,
        resumeCrawlJob,
        listCrawlEvents,
        analyzeSource,
        resumeCrawlJobs,
        listSourceProfiles,
        infrastructure.realtime
      )
    },
    lifecycle
  };
}

export type CrawlerModule = ReturnType<typeof createCrawlerModule>;
