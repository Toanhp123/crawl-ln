import { Router } from 'express';
import type { CrawlJobController } from '../controllers/crawl-job.controller.js';
import { asyncHandler } from '../../../../shared/http/async-handler.js';

export function createCrawlRoutes(controller: CrawlJobController) {
  const router = Router();
  router.get('/sources', asyncHandler(controller.sources));
  router.post('/analyze', asyncHandler(controller.analyze));
  router.post('/jobs', asyncHandler(controller.create));
  router.post('/jobs/resume', asyncHandler(controller.resume));
  router.get('/jobs/:id/events', asyncHandler(controller.events));
  router.post('/jobs/:id/pause', asyncHandler(controller.pause));
  router.post('/jobs/:id/resume', asyncHandler(controller.resumeOne));
  router.delete('/jobs/:id', asyncHandler(controller.cancel));
  return router;
}
