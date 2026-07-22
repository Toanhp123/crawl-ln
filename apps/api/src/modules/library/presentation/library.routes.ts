import { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import type { LibraryController } from './library.controller.js';

export function createLibraryRoutes(controller: LibraryController) {
  const router = Router();
  router.post('/analyze', asyncHandler(controller.analyze));
  router.get('/', asyncHandler(controller.list));
  router.get('/stats', asyncHandler(controller.stats));
  router.post('/:id/update', asyncHandler(controller.update));
  router.get('/:id/chapters', asyncHandler(controller.chapters));
  router.get('/:id/chapters/:index', asyncHandler(controller.chapter));
  router.get('/:id/task', asyncHandler(controller.task));
  router.get('/:id', asyncHandler(controller.detail));
  router.delete('/:id', asyncHandler(controller.delete));
  return router;
}
