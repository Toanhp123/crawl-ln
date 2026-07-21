import { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import type { SearchController } from './search.controller.js';

export function createSearchRoutes(controller: SearchController) {
  const router = Router();
  router.get('/', asyncHandler(controller.search));
  router.post('/rebuild', asyncHandler(controller.rebuild));
  return router;
}
