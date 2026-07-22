import type { NovelDetailQueryService } from './novel-detail-query.service.js';

export class NovelExportQueryService {
  constructor(private readonly details: NovelDetailQueryService) {}

  load(novelId: string) {
    return this.details.findById(novelId);
  }
}
