import type { NovelDetail } from '../../../entities/novel';
import type { CrawlTask } from '../../../entities/task';
import { analyzeNovel } from '../api/analyze-novel';
import { crawlAnalyzedNovel } from '../api/crawl-analyzed-novel';
import { normalizeNovelUrl } from './normalize-novel-url';

export interface AddNovelWorkflowResult {
  detail: NovelDetail;
  task: CrawlTask;
  novelId: string;
  taskId: string;
}

export interface AddNovelWorkflowDependencies {
  analyze(url: string): Promise<NovelDetail>;
  crawl(novelId: string): Promise<CrawlTask>;
}

export function createAddNovelWorkflow(
  dependencies: AddNovelWorkflowDependencies = {
    analyze: analyzeNovel,
    crawl: crawlAnalyzedNovel
  }
) {
  return {
    async execute(sourceUrl: string): Promise<AddNovelWorkflowResult> {
      const detail = await dependencies.analyze(normalizeNovelUrl(sourceUrl));
      const task = await dependencies.crawl(detail.novel.id);
      return { detail, task, novelId: detail.novel.id, taskId: task.id };
    }
  };
}
