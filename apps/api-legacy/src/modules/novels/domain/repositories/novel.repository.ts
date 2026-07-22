import type { Novel, PaginatedNovels } from '../models/novel.js';

export interface NovelRepository {
  findAll(): Promise<Novel[]>;
  list(options: {
    q?: string;
    status: 'all' | 'completed' | 'active' | 'analyzed' | 'crawling' | 'failed' | 'importing';
    sort: 'recent' | 'created' | 'title' | 'chapters';
    limit: number;
    offset: number;
    ids?: string;
    excludeIds?: string;
    readingOrder?: string;
  }): Promise<PaginatedNovels>;
  findById(id: string): Promise<Novel | null>;
  findBySourceUrl(sourceUrl: string): Promise<Novel | null>;
  search(keyword: string): Promise<Novel[]>;
  updateNovel(novel: Novel): Promise<void>;
}
