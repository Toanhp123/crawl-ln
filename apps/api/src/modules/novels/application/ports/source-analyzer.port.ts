import type { AnalyzeNovelResult } from '../models/novel-application.js';

export interface SourceAnalyzerPort {
  execute(url: string): Promise<AnalyzeNovelResult>;
}
