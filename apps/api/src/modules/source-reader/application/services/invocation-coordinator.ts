import type {
  ExecutableSourceCapability,
  SourceReaderCandidate,
  SourceReaderInvocationGuardPort,
  SourceReaderInvocationPort,
  SourceReaderOperationResult,
  SourceReaderRuntimeContext
} from '../source-reader.ports.js';

const unguarded: SourceReaderInvocationGuardPort = {
  async enter() {
    return () => undefined;
  }
};

export class InvocationCoordinator {
  constructor(
    private readonly runtime: SourceReaderInvocationPort,
    private readonly guard: SourceReaderInvocationGuardPort = unguarded
  ) {}

  async invoke(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
    request: Record<string, unknown>;
    context: SourceReaderRuntimeContext;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<SourceReaderOperationResult> {
    const leave = await this.guard.enter(input);
    try {
      return await this.runtime.invoke(input);
    } finally {
      leave();
    }
  }
}
