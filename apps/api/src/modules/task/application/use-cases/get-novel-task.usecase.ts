import type { TaskRepository } from '../../domain/repositories/task.repository.js';

export class GetNovelTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  execute(novelId: string) {
    return this.tasks.findByNovelId(novelId);
  }
}
