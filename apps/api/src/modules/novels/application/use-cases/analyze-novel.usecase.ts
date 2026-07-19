import type { Chapter } from '../models/novel-application.js';
import type { NovelRepository } from '../../domain/repositories/novel.repository.js';
import type { IdGeneratorPort } from '../../../../shared/ports/id-generator.port.js';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { SourceAnalyzerPort } from '../ports/source-analyzer.port.js';
import type { NovelChapterPort } from '../ports/novel-chapter.port.js';
import type { NovelAnalysisPersistencePort } from '../ports/novel-analysis-persistence.port.js';
import { chapterUrlDedupKey } from '../../domain/url/chapter-source-url-key.js';
import { NovelEntity } from '../../domain/entities/novel.entity.js';
import { SourceUrl } from '../../domain/value-objects/source-url.vo.js';
import { NovelValidationError } from '../errors/novel.error.js';

export class AnalyzeNovelUseCase {
  constructor(
    private readonly analyzeSource: SourceAnalyzerPort,
    private readonly repo: NovelRepository,
    private readonly persistence: NovelAnalysisPersistencePort,
    private readonly chapters: NovelChapterPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort
  ) {}

  async execute(url: string) {
    const result = await this.analyzeSource.execute(url);
    const existing = await this.repo.findBySourceUrl(result.sourceUrl);
    const now = this.clock.now().toISOString();
    const novelId = existing?.id ?? this.ids.randomId();
    const novel = NovelEntity.analyze({
      id: novelId,
      title: result.title,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
      author: result.author,
      coverUrl: result.coverUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }).toPrimitives();

    const existingChapters = existing ? await this.chapters.listByNovelId(existing.id) : [];
    const existingByUrl = new Map(
      existingChapters.map((chapter) => [chapterUrlDedupKey(chapter.sourceUrl), chapter])
    );
    const chapters: Chapter[] = result.chapters.map((chapter) => {
      const current = existingByUrl.get(chapterUrlDedupKey(chapter.url));
      SourceUrl.create(chapter.url);
      if (!Number.isInteger(chapter.index) || chapter.index < 0)
        throw new NovelValidationError('Invalid chapter index');
      return {
        id: current?.id ?? this.ids.randomId(),
        novelId,
        index: chapter.index,
        title: chapter.title,
        sourceUrl: chapter.url,
        rawText: current?.rawText,
        cleanText: current?.cleanText,
        status: current?.status ?? 'pending',
        errorMessage: current?.errorMessage,
        contentVersion: current?.contentVersion ?? 1
      };
    });

    await this.persistence.persist(novel, chapters);
    return { ...novel, chapters };
  }
}
