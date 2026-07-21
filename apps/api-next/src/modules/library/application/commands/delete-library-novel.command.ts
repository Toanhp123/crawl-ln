import type { DeleteLibraryNovelCommand } from '../../domain/library.contracts.js';
import type { LibraryUnitOfWork } from '../../domain/repositories/library.repository.js';

export class DeleteLibraryNovelCommandHandler {
  constructor(private readonly unitOfWork: Pick<LibraryUnitOfWork, 'deleteNovel'>) {}

  async execute(command: DeleteLibraryNovelCommand): Promise<void> {
    this.unitOfWork.deleteNovel(command);
  }
}
