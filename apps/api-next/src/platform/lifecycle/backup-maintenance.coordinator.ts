class BackupMaintenanceConflictError extends Error {
  readonly kind = 'conflict' as const;

  constructor(message: string) {
    super(message);
    this.name = 'BackupMaintenanceConflictError';
  }
}

export class BackupMaintenanceCoordinator {
  private active = false;

  constructor(
    private readonly queue: { begin(): void; end(): void },
    private readonly services: ReadonlyArray<{
      start(): Promise<void> | void;
      stop(): Promise<void> | void;
    }>
  ) {}

  async runExclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.active) {
      throw new BackupMaintenanceConflictError('Another maintenance operation is already running');
    }
    this.queue.begin();
    this.active = true;
    const stopped: Array<(typeof this.services)[number]> = [];
    let result: T | undefined;
    let failure: unknown;
    try {
      for (const service of this.services) {
        await service.stop();
        stopped.push(service);
      }
      result = await work();
    } catch (error) {
      failure = error;
    }

    const restartFailures: unknown[] = [];
    for (const service of [...stopped].reverse()) {
      try {
        await service.start();
      } catch (error) {
        restartFailures.push(error);
      }
    }
    try {
      this.queue.end();
    } catch (error) {
      restartFailures.push(error);
    } finally {
      this.active = false;
    }

    if (failure && restartFailures.length > 0) {
      throw new AggregateError(
        [failure, ...restartFailures],
        'Backup maintenance work and restart failed'
      );
    }
    if (restartFailures.length > 0) {
      throw new AggregateError(restartFailures, 'Backup maintenance restart failed');
    }
    if (failure) throw failure;
    return result as T;
  }
}
