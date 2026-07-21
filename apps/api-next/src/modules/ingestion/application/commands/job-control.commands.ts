import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { JobIdentityCommand } from '../../public/ingestion.contracts.js';

type ReceiptStore = Pick<IngestionRepository, 'hasCommandReceipt' | 'recordCommandReceipt'>;

abstract class JobControlCommandHandler {
  protected constructor(
    private readonly commandType: string,
    private readonly receipts: ReceiptStore
  ) {}

  protected async run(command: JobIdentityCommand, operation: () => Promise<void>): Promise<void> {
    if (await this.receipts.hasCommandReceipt(command.commandId, this.commandType)) return;
    await operation();
    await this.receipts.recordCommandReceipt(
      command.commandId,
      this.commandType,
      command.requestedAt
    );
  }
}

export class PauseJobCommandHandler extends JobControlCommandHandler {
  constructor(
    receipts: ReceiptStore,
    private readonly queue: { pause(jobId: string): Promise<void> }
  ) {
    super('pause-job', receipts);
  }

  execute(command: JobIdentityCommand): Promise<void> {
    return this.run(command, () => this.queue.pause(command.jobId));
  }
}

export class ResumeJobCommandHandler extends JobControlCommandHandler {
  constructor(
    receipts: ReceiptStore,
    private readonly queue: { resume(jobId: string): Promise<void> }
  ) {
    super('resume-job', receipts);
  }

  execute(command: JobIdentityCommand): Promise<void> {
    return this.run(command, () => this.queue.resume(command.jobId));
  }
}

export class CancelJobCommandHandler extends JobControlCommandHandler {
  constructor(
    receipts: ReceiptStore,
    private readonly queue: { cancel(jobId: string): Promise<void> }
  ) {
    super('cancel-job', receipts);
  }

  execute(command: JobIdentityCommand): Promise<void> {
    return this.run(command, () => this.queue.cancel(command.jobId));
  }
}
