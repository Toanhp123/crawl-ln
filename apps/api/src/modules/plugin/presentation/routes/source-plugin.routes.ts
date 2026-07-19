import { Router } from 'express';
import type { SourcePluginController } from '../controllers/source-plugin.controller.js';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
export function createSourcePluginRoutes(controller: SourcePluginController) {
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  router.post('/reload', asyncHandler(controller.reload));
  router.patch('/:id', asyncHandler(controller.update));
  return router;
}
