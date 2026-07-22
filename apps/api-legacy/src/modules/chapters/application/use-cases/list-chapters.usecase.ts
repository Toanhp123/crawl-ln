import type { Chapter } from '../../domain/models/chapter.js';
import type { ChapterRepository } from '../../domain/repositories/chapter.repository.js';

export class ListChaptersUseCase {
  constructor(private readonly chapters: ChapterRepository) {}

  async execute(novelId: string): Promise<Chapter[]> {
    return this.chapters.listByNovelId(novelId);
  }
}
