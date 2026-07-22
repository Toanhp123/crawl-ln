import { Router } from 'express';
import type { NovelController } from '../controllers/novel.controller.js';
import { asyncHandler } from '../../../../shared/http/async-handler.js';

export function createNovelRoutes(controller: NovelController) {
  const router = Router();
  router.post('/analyze', asyncHandler(controller.analyze));
  router.get('/', asyncHandler(controller.list));
  router.get('/stats', asyncHandler(controller.stats));
  router.post('/:id/update', asyncHandler(controller.update));
  router.get('/:id', asyncHandler(controller.detail));
  router.get('/:id/task', asyncHandler(controller.task));
  router.delete('/:id', asyncHandler(controller.delete));
  return router;
}
