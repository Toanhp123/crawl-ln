export interface SourceRequestGatePort {
  assertAllowed(url: string): Promise<void>;
  enter(url: string, signal?: AbortSignal): Promise<void>;
}
