export interface SerializedWorkerError {
  name: string;
  message: string;
  code?: string;
}

export type WorkerRequest =
  | {
      type: 'invoke';
      invocationId: string;
      pluginPath: string;
      capability: string;
      request: Record<string, unknown>;
      context: { now: string; normalizedUrl: string };
    }
  | {
      type: 'context-result';
      invocationId: string;
      callId: string;
      ok: true;
      value: unknown;
    }
  | {
      type: 'context-result';
      invocationId: string;
      callId: string;
      ok: false;
      error: SerializedWorkerError;
    };

export type WorkerResponse =
  | {
      type: 'result';
      invocationId: string;
      ok: true;
      value: unknown;
    }
  | {
      type: 'result';
      invocationId: string;
      ok: false;
      error: SerializedWorkerError;
    }
  | {
      type: 'context-call';
      invocationId: string;
      callId: string;
      service: 'http' | 'html' | 'url' | 'cache' | 'logger';
      method: string;
      args: unknown[];
    };
