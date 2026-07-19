import type { RealtimeEvent } from '@novel-tool/shared';
import type { Request, Response } from 'express';
import type { InMemoryRealtimeEventBroker } from './realtime-event-broker.js';

const HEARTBEAT_INTERVAL_MS = 15_000;

export class RealtimeController {
  constructor(private readonly broker: InMemoryRealtimeEventBroker) {}

  stream = (req: Request, res: Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    res.write(': connected\n\n');

    const send = (event: RealtimeEvent) => {
      res.write(`id: ${event.id}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = this.broker.subscribe(send, req.header('last-event-id') ?? undefined);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.once('close', cleanup);
    res.once('close', cleanup);
  };
}
