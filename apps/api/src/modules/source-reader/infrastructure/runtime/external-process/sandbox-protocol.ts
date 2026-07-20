import type { ExternalPluginOperation } from '../../../application/ports/external-plugin-supervisor.port.js';

export const SANDBOX_PROTOCOL_VERSION = 1 as const;

export interface SandboxRequestFrame {
  protocolVersion: 1;
  type: 'request';
  requestId: string;
  operation: ExternalPluginOperation;
  deadlineAt: string;
  payload: Record<string, unknown>;
}

export interface SandboxCancelFrame {
  protocolVersion: 1;
  type: 'cancel';
  requestId: string;
  reason: string;
}

export interface SandboxHostResultFrame {
  protocolVersion: 1;
  type: 'host-result';
  requestId: string;
  callId: string;
  ok: boolean;
  value?: unknown;
  error?: { name: string; message: string; code?: string };
}

export type HostToSandboxFrame = SandboxRequestFrame | SandboxCancelFrame | SandboxHostResultFrame;

export interface SandboxHelloFrame {
  protocolVersion: 1;
  type: 'hello';
}

export interface SandboxResponseFrame {
  protocolVersion: 1;
  type: 'response';
  requestId: string;
  ok: boolean;
  value?: unknown;
  error?: { name: string; message: string; code?: string };
}

export interface SandboxHostCallFrame {
  protocolVersion: 1;
  type: 'host-call';
  requestId: string;
  callId: string;
  service: 'clock' | 'http' | 'html' | 'url' | 'cache' | 'logger';
  method: string;
  args: unknown[];
}

export type SandboxToHostFrame = SandboxHelloFrame | SandboxResponseFrame | SandboxHostCallFrame;
