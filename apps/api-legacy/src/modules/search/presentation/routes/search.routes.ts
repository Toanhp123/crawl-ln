import { Router } from 'express';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
import type { SearchController } from '../controllers/search.controller.js';
export function createSearchRoutes(controller: SearchController) {
  const r = Router();
  r.get('/', asyncHandler(controller.search));
  r.post('/rebuild', asyncHandler(controller.rebuild));
  return r;
}
