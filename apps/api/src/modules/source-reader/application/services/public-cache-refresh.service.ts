export class PublicCacheRefreshService {
  private readonly pending = new Map<string, Promise<void>>();

  schedule(key: string, refresh: () => Promise<unknown>): void {
    if (this.pending.has(key)) return;
    const pending = Promise.resolve()
      .then(refresh)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([...this.pending.values()]);
  }
}
