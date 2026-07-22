import type { Novel, NovelDetail } from '../models/novel-application.js';
import { NovelEntity } from '../../domain/entities/novel.entity.js';
import type { NovelDetailQueryService } from './novel-detail-query.service.js';

export class NovelCrawlLifecycleService {
  constructor(private readonly details: NovelDetailQueryService) {}

  findById(id: string): Promise<NovelDetail | null> {
    return this.details.findById(id);
  }

  markCrawling(novel: Novel, now: string): Novel {
    return NovelEntity.create(novel).markCrawling(now).toPrimitives();
  }

  markCompleted(novel: Novel, now: string): Novel {
    return NovelEntity.create(novel).markCompleted(now).toPrimitives();
  }

  markFailed(novel: Novel, now: string): Novel {
    return NovelEntity.create(novel).markFailed(now).toPrimitives();
  }
}
