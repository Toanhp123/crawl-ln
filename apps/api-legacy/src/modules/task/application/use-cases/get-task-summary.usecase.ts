import type { TaskRepository } from '../../domain/repositories/task.repository.js';

export class GetTaskSummaryUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute() {
    return { activeCount: await this.tasks.countActive() };
  }
}
