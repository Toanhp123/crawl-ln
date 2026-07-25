import { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import type { SearchController } from './search.controller.js';

export function createSearchRoutes(controller: SearchController) {
  const router = Router();
  router.get('/status', asyncHandler(controller.status));
  router.post('/rebuild', asyncHandler(controller.rebuild));
  router.get('/', asyncHandler(controller.search));
  return router;
}
