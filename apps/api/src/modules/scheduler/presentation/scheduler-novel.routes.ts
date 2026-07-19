import { Router } from 'express';
import type { SchedulerController } from './scheduler.controller.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
export function createSchedulerNovelRoutes(controller: SchedulerController) {
  const router = Router();
  router.put('/:id/auto-update', asyncHandler(controller.updatePolicyHandler));
  router.get('/:id/update-diagnostics', asyncHandler(controller.diagnosticsHandler));
  return router;
}
