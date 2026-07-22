import type { Chapter, CrawlTask, Novel } from '@novel-tool/shared';
import type { CrawlPersistencePort } from '../../modules/crawler/application/ports/crawl-persistence.port.js';
import type { SqliteDatabase } from './sqlite.js';

type ChapterWriter = { update(chapter: Chapter): void };
type TaskWriter = { update(task: CrawlTask): void };
type NovelWriter = { update(novel: Novel): void };

export class CrawlRunSqliteUnitOfWork implements CrawlPersistencePort {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly chapters: ChapterWriter,
    private readonly tasks: TaskWriter,
    private readonly novels: NovelWriter
  ) {}

  async persistStart(task: CrawlTask, novel: Novel): Promise<void> {
    this.persistTaskAndNovel(task, novel);
  }

  async persistChapterResult(chapter: Chapter, task: CrawlTask): Promise<void> {
    this.database.transactionSync(() => {
      this.chapters.update(chapter);
      this.tasks.update(task);
    });
  }

  async persistFinal(task: CrawlTask, novel: Novel): Promise<void> {
    this.persistTaskAndNovel(task, novel);
  }

  private persistTaskAndNovel(task: CrawlTask, novel: Novel): void {
    this.database.transactionSync(() => {
      this.tasks.update(task);
      this.novels.update(novel);
    });
  }
}
