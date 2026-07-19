import type { Chapter } from '../../domain/models/chapter.js';
import type { ChapterRepository } from '../../domain/repositories/chapter.repository.js';

export class ChapterCatalogService {
  constructor(private readonly repository: ChapterRepository) {}

  findByNovelAndIndex(novelId: string, chapterIndex: number): Promise<Chapter | null> {
    return this.repository.findByNovelAndIndex(novelId, chapterIndex);
  }

  listByNovelId(novelId: string): Promise<Chapter[]> {
    return this.repository.listByNovelId(novelId);
  }
}
