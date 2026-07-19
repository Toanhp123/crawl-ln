import type {
  Chapter,
  Novel,
  UpdateNovelResult
} from '../application/models/novel-public-contracts.js';

export interface AnalyzeNovelApi {
  execute(url: string): Promise<Novel & { chapters: Chapter[] }>;
}

export interface UpdateNovelApi {
  execute(novelId: string): Promise<UpdateNovelResult>;
}

export interface NovelsApi {
  readonly analyzeNovel: AnalyzeNovelApi;
  readonly updateNovel: UpdateNovelApi;
}
