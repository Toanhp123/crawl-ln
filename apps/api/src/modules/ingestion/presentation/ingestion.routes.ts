import { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import type { IngestionController } from './ingestion.controller.js';

export function createIngestionRoutes(controller: IngestionController) {
  const router = Router();
  router.post('/analyze', asyncHandler(controller.analyze));
  router.post('/jobs', asyncHandler(controller.create));
  router.post('/jobs/resume', asyncHandler(controller.resume));
  router.get('/jobs/:id/events', asyncHandler(controller.events));
  router.post('/jobs/:id/pause', asyncHandler(controller.pause));
  router.post('/jobs/:id/resume', asyncHandler(controller.resumeOne));
  router.delete('/jobs/:id', asyncHandler(controller.cancel));
  return router;
}

export function createTaskRoutes(controller: IngestionController) {
  const router = Router();
  router.get('/', asyncHandler(controller.listTasks));
  router.get('/summary', asyncHandler(controller.taskSummary));
  router.get('/:id', asyncHandler(controller.taskDetail));
  return router;
}
