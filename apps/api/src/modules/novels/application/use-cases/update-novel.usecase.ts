import type { NovelDetail, UpdateNovelResult } from '../models/novel-application.js';
import type { NovelRepository } from '../../domain/repositories/novel.repository.js';
import { NovelNotFoundError } from '../errors/novel.error.js';
import { chapterUrlDedupKey } from '../../domain/url/chapter-source-url-key.js';
import type { AnalyzeNovelUseCase } from './analyze-novel.usecase.js';
import type { CrawlJobCreatorPort } from '../ports/crawl-job-creator.port.js';
import type { NovelDetailQueryService } from '../services/novel-detail-query.service.js';

export class UpdateNovelUseCase {
  constructor(
    private readonly novels: NovelRepository,
    private readonly details: NovelDetailQueryService,
    private readonly analyzeNovel: AnalyzeNovelUseCase,
    private readonly createCrawlJob: CrawlJobCreatorPort
  ) {}

  async execute(novelId: string): Promise<UpdateNovelResult> {
    const before = await this.details.findById(novelId);
    if (!before) throw new NovelNotFoundError('Novel not found');

    const knownUrls = new Set(
      before.chapters.map((chapter) => chapterUrlDedupKey(chapter.sourceUrl))
    );
    await this.analyzeNovel.execute(before.novel.sourceUrl);
    const refreshed = await this.details.findById(novelId);
    if (!refreshed) throw new NovelNotFoundError('Novel not found after refresh');

    const newChapterCount = refreshed.chapters.filter(
      (chapter) => !knownUrls.has(chapterUrlDedupKey(chapter.sourceUrl))
    ).length;
    const pendingChapterCount = refreshed.chapters.filter(
      (chapter) => chapter.status !== 'fetched'
    ).length;

    if (pendingChapterCount === 0) {
      const restored = { ...refreshed.novel, status: before.novel.status };
      await this.novels.updateNovel(restored);
      return {
        novel: { novel: restored, chapters: refreshed.chapters },
        newChapterCount,
        pendingChapterCount,
        task: null
      };
    }

    const task = await this.createCrawlJob.execute(novelId);
    return { novel: refreshed, newChapterCount, pendingChapterCount, task };
  }
}
