import type { NovelDetail } from '../models/novel-application.js';
import type { NovelRepository } from '../../domain/repositories/novel.repository.js';
import type { NovelChapterPort } from '../ports/novel-chapter.port.js';

export class NovelDetailQueryService {
  constructor(
    private readonly novels: NovelRepository,
    private readonly chapters: NovelChapterPort
  ) {}

  async findById(novelId: string): Promise<NovelDetail | null> {
    const novel = await this.novels.findById(novelId);
    if (!novel) return null;
    return { novel, chapters: await this.chapters.listByNovelId(novelId) };
  }

  async findBySourceUrl(sourceUrl: string): Promise<NovelDetail | null> {
    const novel = await this.novels.findBySourceUrl(sourceUrl);
    if (!novel) return null;
    return { novel, chapters: await this.chapters.listByNovelId(novel.id) };
  }
}
