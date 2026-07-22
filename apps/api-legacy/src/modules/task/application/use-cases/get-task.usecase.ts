import type { TaskRepository } from '../../domain/repositories/task.repository.js';
import { TaskNotFoundError } from '../errors/task.error.js';

export class GetTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(id: string) {
    const task = await this.tasks.findById(id);
    if (!task) throw new TaskNotFoundError('Task not found');
    return task;
  }
}
