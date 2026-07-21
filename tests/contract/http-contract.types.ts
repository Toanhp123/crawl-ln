import type { Express } from 'express';

export interface HttpContractRuntime {
  create(): Promise<{ app: Express; close(): Promise<void> }>;
}
