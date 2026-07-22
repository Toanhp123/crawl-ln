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

interface SandboxHostCallBase {
  protocolVersion: 1;
  type: 'host-call';
  requestId: string;
  callId: string;
}

export type SandboxHostCallFrame = SandboxHostCallBase &
  (
    | { service: 'clock'; method: 'now'; args: [] }
    | { service: 'http'; method: 'get'; args: [string, unknown?] }
    | { service: 'html'; method: 'load'; args: [string] }
    | { service: 'html'; method: 'text'; args: [string, string] }
    | { service: 'html'; method: 'attr'; args: [string, string, string] }
    | { service: 'html'; method: 'html'; args: [string, string] }
    | { service: 'html'; method: 'all'; args: [string, string] }
    | { service: 'html'; method: 'remove'; args: [string, string] }
    | { service: 'html'; method: 'nodeText'; args: [string, string?] }
    | { service: 'html'; method: 'nodeAttr'; args: [string, string] }
    | { service: 'html'; method: 'nodeHtml'; args: [string, string?] }
    | { service: 'url'; method: 'normalize'; args: [string] }
    | { service: 'url'; method: 'resolve'; args: [string, string] }
    | { service: 'cache'; method: 'get'; args: [string] }
    | { service: 'cache'; method: 'set'; args: [string, unknown, number] }
    | { service: 'logger'; method: 'info' | 'warn'; args: [string, unknown?] }
    | { service: 'browser'; method: 'open' | 'waitFor' | 'text' | 'html' | 'click'; args: [string] }
    | {
        service: 'browser';
        method: 'fillSecret';
        args: [string, { credentialId: string; field: string }];
      }
    | { service: 'browser'; method: 'cookies'; args: [] }
  );

export type SandboxToHostFrame = SandboxHelloFrame | SandboxResponseFrame | SandboxHostCallFrame;
