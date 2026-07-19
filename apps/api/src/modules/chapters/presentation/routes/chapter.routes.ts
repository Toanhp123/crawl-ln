import { Router } from 'express';
import type { ChapterController } from '../controllers/chapter.controller.js';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
export function createChapterRoutes(controller: ChapterController) {
  const router = Router();
  router.get('/:id/chapters', asyncHandler(controller.list));
  router.get('/:id/chapters/:index', asyncHandler(controller.detail));
  return router;
}
