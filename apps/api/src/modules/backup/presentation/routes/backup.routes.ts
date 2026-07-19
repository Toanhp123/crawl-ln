import express, { Router } from 'express';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
import type { BackupController } from '../controllers/backup.controller.js';

export function createBackupRoutes(controller: BackupController) {
  const router = Router();
  router.post('/', asyncHandler(controller.create));
  router.post(
    '/restore',
    express.raw({ type: 'application/octet-stream', limit: '512mb' }),
    asyncHandler(controller.restore)
  );
  return router;
}
