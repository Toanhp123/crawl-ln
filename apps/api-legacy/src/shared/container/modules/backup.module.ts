import { resolve } from 'node:path';
import { env } from '../../config/env.js';
import { CreateBackupUseCase } from '../../../modules/backup/application/use-cases/create-backup.usecase.js';
import { RestoreBackupUseCase } from '../../../modules/backup/application/use-cases/restore-backup.usecase.js';
import { JsZipBackupArchive } from '../../../modules/backup/infrastructure/archive/jszip-backup.archive.js';
import { SqliteBackupStore } from '../../../modules/backup/infrastructure/sqlite/sqlite-backup.store.js';
import { BackupController } from '../../../modules/backup/presentation/controllers/backup.controller.js';
import type { CrawlerModule } from './crawler.module.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { SchedulerModule } from './scheduler.module.js';

export function createBackupModule(
  infrastructure: InfrastructureModule,
  crawler: CrawlerModule,
  scheduler: SchedulerModule
) {
  const archive = new JsZipBackupArchive();
  const store = new SqliteBackupStore(
    infrastructure.database,
    resolve(env.storageDir, 'novel-tool.sqlite'),
    env.storageDir
  );
  const maintenance = {
    async runExclusive<T>(work: () => Promise<T>): Promise<T> {
      crawler.lifecycle.queue.beginMaintenance();
      await scheduler.lifecycle.service.stop();
      try {
        return await work();
      } finally {
        scheduler.lifecycle.service.start();
        crawler.lifecycle.queue.endMaintenance();
      }
    }
  };
  const createBackup = new CreateBackupUseCase(store, archive, infrastructure.clock);
  const restoreBackup = new RestoreBackupUseCase(store, archive, infrastructure.clock, maintenance);
  return {
    presentation: {
      controller: new BackupController(createBackup, restoreBackup, infrastructure.realtime)
    }
  };
}
