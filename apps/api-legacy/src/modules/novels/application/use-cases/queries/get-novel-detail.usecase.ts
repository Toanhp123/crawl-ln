import type { NovelDetailQueryService } from '../../services/novel-detail-query.service.js';
import { NovelNotFoundError } from '../../errors/novel.error.js';

export class GetNovelDetailUseCase {
  constructor(private readonly details: NovelDetailQueryService) {}

  async execute(id: string) {
    const result = await this.details.findById(id);
    if (!result) throw new NovelNotFoundError('Novel not found');
    return result;
  }
}
