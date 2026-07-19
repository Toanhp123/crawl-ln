import type { NovelRepository } from '../../../domain/repositories/novel.repository.js';

export class GetNovelStatsUseCase {
  constructor(private readonly novels: NovelRepository) {}

  async execute() {
    const novels = await this.novels.findAll();
    return {
      novels: novels.length,
      analyzed: novels.filter((item) => item.status === 'analyzed').length,
      crawling: novels.filter((item) => item.status === 'crawling').length,
      completed: novels.filter((item) => item.status === 'completed').length,
      failed: novels.filter((item) => item.status === 'failed').length
    };
  }
}
