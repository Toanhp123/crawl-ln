import type { SetLibraryIngestionStateCommand } from '../../domain/library.contracts.js';
import type { LibraryUnitOfWork } from '../../domain/repositories/library.repository.js';

export class SetIngestionStateCommandHandler {
  constructor(private readonly unitOfWork: Pick<LibraryUnitOfWork, 'setIngestionState'>) {}

  async execute(command: SetLibraryIngestionStateCommand): Promise<void> {
    this.unitOfWork.setIngestionState(command);
  }
}
