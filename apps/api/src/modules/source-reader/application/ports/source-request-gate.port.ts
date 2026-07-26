export interface SourceRequestGatePort {
  assertAllowed(url: string, signal?: AbortSignal): Promise<void>;
  enter(url: string, signal?: AbortSignal): Promise<void>;
}
