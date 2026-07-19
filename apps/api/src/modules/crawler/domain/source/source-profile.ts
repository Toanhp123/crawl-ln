export type SelectorValue = string | string[];

export type SourceProfileSelectors = {
  title: SelectorValue;
  author?: SelectorValue;
  cover?: SelectorValue;
  description?: SelectorValue;
  chapterLinks: SelectorValue;
  chapterTitle?: SelectorValue;
  chapterContent: SelectorValue;
  remove?: string[];
};

export type SourceProfileHttp = {
  userAgent?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type SourceProfileCrawlPolicy = {
  respectRobotsTxt?: boolean;
  crawlDelayMs?: number;
  maxChaptersPerRun?: number;
};

export type ChapterListOrder = 'oldest-first' | 'newest-first';

export type SourceProfile = {
  id: string;
  name: string;
  hosts: string[];
  selectors: SourceProfileSelectors;
  chapterListOrder?: ChapterListOrder;
  enabled?: boolean;
  http?: SourceProfileHttp;
  crawlPolicy?: SourceProfileCrawlPolicy;
};

export interface SourceProfileRepositoryPort {
  findById(id: string): Promise<SourceProfile | null>;
  findByUrl(url: string): Promise<SourceProfile | null>;
  list(): Promise<SourceProfile[]>;
}
