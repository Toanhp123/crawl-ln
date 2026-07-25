import { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import type { BackupController } from './backup.controller.js';
import { createRestoreSessionRoutes } from './restore-session.routes.js';
import type { RestoreSessionController } from './restore-session.controller.js';

export function createBackupRoutes(
  controller: BackupController,
  restoreSessions?: RestoreSessionController
) {
  const router = Router();
  router.post('/operations', asyncHandler(controller.startOperation));
  router.get('/operations/current', asyncHandler(controller.currentOperation));
  router.get('/operations/:operationId', asyncHandler(controller.readOperation));
  router.post('/operations/:operationId/cancel', asyncHandler(controller.cancelOperation));
  router.post(
    '/operations/:operationId/download-token',
    asyncHandler(controller.issueDownloadToken)
  );
  router.get('/downloads/:token', asyncHandler(controller.download));
  if (restoreSessions) router.use('/restore-sessions', createRestoreSessionRoutes(restoreSessions));
  return router;
}
