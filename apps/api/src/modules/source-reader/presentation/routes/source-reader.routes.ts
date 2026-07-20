import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
import type { SourceReaderAdminController } from '../controllers/source-reader-admin.controller.js';
import type { SourceReaderController } from '../controllers/source-reader.controller.js';
import { sourceReaderActorMiddleware } from '../source-reader-actor.middleware.js';
import { sourceReaderRequestIdMiddleware } from '../source-reader-request-id.middleware.js';

export interface SourceReaderPresentation {
  reader: SourceReaderController;
  admin: SourceReaderAdminController;
  actorOptions: {
    localAdminEnabled: boolean;
    trustRoleHeaders: boolean;
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }
});

export function createSourceReaderRoutes(presentation: SourceReaderPresentation) {
  const router = Router();
  const { reader, admin } = presentation;
  router.use(sourceReaderRequestIdMiddleware);
  router.use(sourceReaderActorMiddleware(presentation.actorOptions));

  router.post('/identify', asyncHandler(reader.identify));
  router.post('/metadata', asyncHandler(reader.metadata));
  router.post('/chapter-list', asyncHandler(reader.chapterList));
  router.post('/chapter-content', asyncHandler(reader.chapterContent));
  router.post('/search', asyncHandler(reader.search));
  router.post('/latest-updates', asyncHandler(reader.latestUpdates));

  router.get('/plugins', asyncHandler(admin.listPlugins));
  router.get('/plugins/:pluginId', asyncHandler(admin.pluginDiagnostics));
  router.post('/plugins/install', upload.single('plugin'), asyncHandler(admin.installPlugin));
  router.post('/plugins/:pluginId/enable', asyncHandler(admin.enablePlugin));
  router.post('/plugins/:pluginId/disable', asyncHandler(admin.disablePlugin));
  router.delete('/plugins/:pluginId', asyncHandler(admin.removePlugin));
  router.post('/plugins/:pluginId/test', asyncHandler(admin.testPlugin));
  router.get('/plugins/:pluginId/health', asyncHandler(admin.pluginHealth));
  router.get('/plugins/:pluginId/permissions', asyncHandler(admin.listPermissions));
  router.post('/plugins/:pluginId/permissions/approve', asyncHandler(admin.approvePermissions));
  router.post('/plugins/:pluginId/permissions/deny', asyncHandler(admin.denyPermissions));

  router.get('/credentials', asyncHandler(admin.listCredentials));
  router.post('/credentials', asyncHandler(admin.createCredential));
  router.patch('/credentials/:id', asyncHandler(admin.updateCredential));
  router.delete('/credentials/:id', asyncHandler(admin.deleteCredential));
  router.post('/credentials/:id/login', asyncHandler(admin.loginCredential));
  router.post('/credentials/:id/logout', asyncHandler(admin.logoutCredential));
  router.post('/credentials/:id/test', asyncHandler(admin.testCredential));

  router.get('/network-profiles', asyncHandler(admin.listNetworkProfiles));
  router.post('/network-profiles', asyncHandler(admin.createNetworkProfile));
  router.patch('/network-profiles/:id', asyncHandler(admin.updateNetworkProfile));
  router.delete('/network-profiles/:id', asyncHandler(admin.deleteNetworkProfile));
  router.post('/network-profiles/:id/test', asyncHandler(admin.testNetworkProfile));

  router.get('/auth/challenges', asyncHandler(admin.listChallenges));
  router.get('/auth/challenges/:id', asyncHandler(admin.getChallenge));
  router.post('/auth/challenges/:id/respond', asyncHandler(admin.respondChallenge));
  router.post('/auth/challenges/:id/cancel', asyncHandler(admin.cancelChallenge));

  return router;
}
