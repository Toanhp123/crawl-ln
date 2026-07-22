import type { NovelRepository } from '../../../domain/repositories/novel.repository.js';

export type ListNovelsOptions = {
  q?: string;
  status: 'all' | 'completed' | 'active' | 'analyzed' | 'crawling' | 'failed' | 'importing';
  sort: 'recent' | 'created' | 'title' | 'chapters';
  limit: number;
  offset: number;
};

export class ListNovelsUseCase {
  constructor(private readonly novels: NovelRepository) {}

  execute(options: ListNovelsOptions) {
    return this.novels.list(options);
  }
}
