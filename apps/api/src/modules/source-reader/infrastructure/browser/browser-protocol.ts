import type { BrowserSecretHandle } from '../../application/ports/browser-runtime.port.js';

export type BrowserCommandPayload =
  | { operation: 'open'; url: string }
  | { operation: 'wait-for'; selector: string }
  | { operation: 'text'; selector: string }
  | { operation: 'html'; selector: string }
  | { operation: 'click'; selector: string }
  | { operation: 'fill-secret'; selector: string; handle: BrowserSecretHandle }
  | { operation: 'cookies' }
  | { operation: 'close' };

export type BrowserCommand =
  | ({ type: 'command'; id: string } & BrowserCommandPayload)
  | { type: 'secret-result'; requestId: string; ok: true; value: string }
  | { type: 'secret-result'; requestId: string; ok: false; error: string };

export type BrowserEvent =
  | { type: 'ready' }
  | { type: 'result'; id: string; ok: true; value?: unknown }
  | { type: 'result'; id: string; ok: false; error: string }
  | { type: 'resolve-secret'; requestId: string; handle: BrowserSecretHandle };
