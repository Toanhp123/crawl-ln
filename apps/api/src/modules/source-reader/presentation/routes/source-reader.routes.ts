import { Router } from 'express';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
import type { SourceReaderController } from '../controllers/source-reader.controller.js';

export function createSourceReaderRoutes(controller: SourceReaderController) {
  const router = Router();
  router.post('/identify', asyncHandler(controller.identify));
  router.post('/metadata', asyncHandler(controller.metadata));
  router.post('/chapter-list', asyncHandler(controller.chapterList));
  router.post('/chapter-content', asyncHandler(controller.chapterContent));
  return router;
}
