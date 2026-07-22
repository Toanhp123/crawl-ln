import type { SaveChapterContentCommand } from '../../domain/library.contracts.js';
import type { LibraryChapter } from '../../domain/library.models.js';
import type { LibraryUnitOfWork } from '../../domain/repositories/library.repository.js';

export class SaveChapterContentCommandHandler {
  constructor(private readonly unitOfWork: Pick<LibraryUnitOfWork, 'saveChapterContent'>) {}

  async execute(command: SaveChapterContentCommand): Promise<LibraryChapter> {
    return this.unitOfWork.saveChapterContent(command);
  }
}
