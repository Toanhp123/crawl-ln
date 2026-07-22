import { Router } from 'express';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
import type { ExportController } from '../controllers/export.controller.js';
export function createExportRoutes(controller: ExportController) {
  const router = Router();
  router.post('/novels/:id', asyncHandler(controller.create));
  return router;
}
