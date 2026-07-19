import { Router } from 'express';
import type { TaskController } from '../controllers/task.controller.js';
import { asyncHandler } from '../../../../shared/http/async-handler.js';

export function createTaskRoutes(controller: TaskController) {
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  router.get('/summary', asyncHandler(controller.summary));
  router.get('/:id', asyncHandler(controller.detail));
  return router;
}
