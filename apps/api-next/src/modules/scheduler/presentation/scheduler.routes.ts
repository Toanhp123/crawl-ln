import { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import type { SchedulerController } from './scheduler.controller.js';

export function createSchedulerRoutes(controller: SchedulerController) {
  const router = Router();
  router.get('/status', asyncHandler(controller.status));
  router.post('/tick', asyncHandler(controller.tick));
  return router;
}

export function createSchedulerNovelRoutes(controller: SchedulerController) {
  const router = Router();
  router.put('/:id/auto-update', asyncHandler(controller.updatePolicy));
  router.get('/:id/update-diagnostics', asyncHandler(controller.listDiagnostics));
  return router;
}
