const userScopedFailures = (code: string) =>
  code.startsWith('AUTH') ||
  code.startsWith('CREDENTIAL_') ||
  code.startsWith('SESSION_') ||
  code === 'PLUGIN_PERMISSION_DENIED';

export class SourceReaderCircuitBreaker {
  private readonly states = new Map<
    string,
    { failures: number; openedAt?: number; halfOpenProbe: boolean }
  >();

  constructor(private readonly policy: { failureThreshold: number; openMs: number }) {}

  allow(key: string, now: number): boolean {
    const state = this.states.get(key);
    if (state?.openedAt === undefined) return true;
    if (now - state.openedAt < this.policy.openMs) return false;
    if (state.halfOpenProbe) return false;
    state.halfOpenProbe = true;
    return true;
  }

  recordSuccess(key: string): void {
    this.states.delete(key);
  }

  recordFailure(key: string, code: string, now: number): void {
    if (userScopedFailures(code)) return;
    const state = this.states.get(key) ?? { failures: 0, halfOpenProbe: false };
    state.failures += 1;
    state.halfOpenProbe = false;
    if (state.failures >= this.policy.failureThreshold) state.openedAt = now;
    this.states.set(key, state);
  }
}
