import type { ReconcileAnalysisCommand } from '../../domain/library.contracts.js';
import type { LibraryNovelDetail } from '../../domain/library.models.js';
import type { LibraryUnitOfWork } from '../../domain/repositories/library.repository.js';

export class ReconcileAnalysisCommandHandler {
  constructor(private readonly unitOfWork: Pick<LibraryUnitOfWork, 'reconcileAnalysis'>) {}

  async execute(command: ReconcileAnalysisCommand): Promise<LibraryNovelDetail> {
    return this.unitOfWork.reconcileAnalysis(command);
  }
}
