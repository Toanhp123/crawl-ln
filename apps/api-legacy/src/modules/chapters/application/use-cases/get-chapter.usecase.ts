import type { ChapterRepository } from '../../domain/repositories/chapter.repository.js';
import { ChapterNotFoundError } from '../errors/chapter.error.js';

export class GetChapterUseCase {
  constructor(private readonly chapters: ChapterRepository) {}

  async execute(novelId: string, chapterIndex: number) {
    const chapter = await this.chapters.findByNovelAndIndex(novelId, chapterIndex);
    if (!chapter) throw new ChapterNotFoundError('Chapter not found');
    return chapter;
  }
}
