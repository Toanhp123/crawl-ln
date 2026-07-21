export class SourceReaderMaintenanceService {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly cache: { deleteExpired(now?: number): Promise<number> },
    private readonly sessions: { expireBefore(now: string): Promise<number> },
    private readonly challenges: { expirePending(): Promise<void> },
    private readonly now: () => Date,
    private readonly intervalMs = 15 * 60_000
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<void> {
    const now = this.now();
    await Promise.all([
      this.cache.deleteExpired(now.getTime()),
      this.sessions.expireBefore(now.toISOString()),
      this.challenges.expirePending()
    ]);
  }
}
