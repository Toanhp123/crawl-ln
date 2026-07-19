import { Router } from 'express';
import type { SchedulerController } from './scheduler.controller.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';

export function createSchedulerRoutes(controller: SchedulerController) {
  const router = Router();
  router.get('/status', asyncHandler(controller.status));
  router.post('/tick', asyncHandler(controller.tick));
  return router;
}
