import express, { Router } from 'express';
import { asyncHandler } from '../../../platform/http/async-handler.js';
import { RESTORE_UPLOAD_CHUNK_BYTES } from '../application/services/restore-preparation.service.js';
import type { RestoreSessionController } from './restore-session.controller.js';

export function createRestoreSessionRoutes(controller: RestoreSessionController) {
  const router = Router();
  router.post('/', asyncHandler(controller.create));
  router.get('/current', asyncHandler(controller.current));
  router.get('/:sessionId', asyncHandler(controller.read));
  router.put(
    '/:sessionId/chunk',
    express.raw({ type: 'application/octet-stream', limit: RESTORE_UPLOAD_CHUNK_BYTES }),
    asyncHandler(controller.append)
  );
  router.post('/:sessionId/complete', asyncHandler(controller.complete));
  router.post('/:sessionId/unlock', asyncHandler(controller.unlock));
  router.post('/:sessionId/plan', asyncHandler(controller.plan));
  router.post('/:sessionId/restore', asyncHandler(controller.startRestore));
  router.post('/:sessionId/touch', asyncHandler(controller.touch));
  router.delete('/:sessionId', asyncHandler(controller.cancel));
  return router;
}
