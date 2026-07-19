import type { TaskRepository } from '../../domain/repositories/task.repository.js';

export class ListTasksUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  execute(limit = 100) {
    return this.tasks.findAll(limit);
  }
}
