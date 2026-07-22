import { Router } from 'express';
import type { RealtimeController } from './realtime.controller.js';

export function createRealtimeRoutes(controller: RealtimeController) {
  const router = Router();
  router.get('/', controller.stream);
  return router;
}
