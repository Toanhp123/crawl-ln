import type { Request, Response } from 'express';
import type { InMemoryRealtimeEventBroker } from './in-memory-realtime-event-broker.js';
import type { RealtimeEvent } from './realtime-event.js';

const heartbeatIntervalMs = 15_000;

export class RealtimeController {
  constructor(private readonly broker: InMemoryRealtimeEventBroker) {}

  stream = (request: Request, response: Response) => {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write('retry: 3000\n\n');
    response.write(': connected\n\n');

    const send = (event: RealtimeEvent) => {
      response.write(`id: ${event.id}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = this.broker.subscribe(send, request.header('last-event-id') ?? undefined);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), heartbeatIntervalMs);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.once('close', cleanup);
    response.once('close', cleanup);
  };
}
