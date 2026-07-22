import type { NovelDeletionPort } from '../../ports/novel-deletion.port.js';

export class DeleteNovelUseCase {
  constructor(private readonly deletion: NovelDeletionPort) {}

  execute(id: string) {
    return this.deletion.delete(id);
  }
}
