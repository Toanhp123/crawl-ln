import { AutoUpdateSchedulerService } from '../../../modules/scheduler/application/auto-update-scheduler.service.js';
import { ListNovelUpdateDiagnosticsUseCase } from '../../../modules/scheduler/application/list-novel-update-diagnostics.usecase.js';
import { UpdateAutoUpdatePolicyUseCase } from '../../../modules/scheduler/application/update-auto-update-policy.usecase.js';
import { SchedulerSqliteRepository } from '../../../modules/scheduler/infrastructure/scheduler-sqlite.repository.js';
import { AutoUpdatePolicySqliteRepository } from '../../../modules/scheduler/infrastructure/sqlite/auto-update-policy-sqlite.repository.js';
import { SchedulerController } from '../../../modules/scheduler/presentation/scheduler.controller.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { NovelsModule } from './novels.module.js';
import type { TasksModule } from './tasks.module.js';
import type {
  SchedulerApi,
  SchedulerLifecycle
} from '../../../modules/scheduler/public/scheduler.api.js';
import { ApplicationEventNovelUpdateDiagnosticPublisher } from '../../../modules/scheduler/infrastructure/events/application-event-scheduler-diagnostic.publisher.js';
import { RecordSchedulerDiagnosticHandler } from '../../../modules/scheduler/application/handlers/record-scheduler-diagnostic.handler.js';
import {
  SCHEDULER_DIAGNOSTIC_EVENT,
  type NovelUpdateDiagnosticEvent
} from '../../../modules/scheduler/application/events/scheduler-diagnostic.event.js';

export function createSchedulerModule(
  infrastructure: InfrastructureModule,
  novels: NovelsModule,
  tasks: TasksModule
) {
  const autoUpdatePolicies = new AutoUpdatePolicySqliteRepository(infrastructure.database);
  const diagnostics = new SchedulerSqliteRepository(infrastructure.database);
  const diagnosticHandler = new RecordSchedulerDiagnosticHandler(diagnostics);
  infrastructure.events.subscribe<NovelUpdateDiagnosticEvent>(SCHEDULER_DIAGNOSTIC_EVENT, (event) =>
    diagnosticHandler.handle(event)
  );
  const diagnosticPublisher = new ApplicationEventNovelUpdateDiagnosticPublisher(
    infrastructure.events
  );
  const updateAutoUpdatePolicy = new UpdateAutoUpdatePolicyUseCase(
    autoUpdatePolicies,
    infrastructure.clock
  );
  const listDiagnostics = new ListNovelUpdateDiagnosticsUseCase(diagnostics);
  const scheduler = new AutoUpdateSchedulerService(
    autoUpdatePolicies,
    { hasActiveForNovel: (novelId) => tasks.api.activeTasks.hasForNovel(novelId) },
    diagnosticPublisher,
    novels.api.updateNovel,
    infrastructure.clock,
    infrastructure.ids,
    infrastructure.logger
  );

  const api = { updateAutoUpdatePolicy } satisfies SchedulerApi;
  const lifecycle = { service: scheduler } satisfies SchedulerLifecycle;

  return {
    api,
    presentation: {
      controller: new SchedulerController(
        scheduler,
        updateAutoUpdatePolicy,
        listDiagnostics,
        infrastructure.realtime
      )
    },
    lifecycle
  };
}

export type SchedulerModule = ReturnType<typeof createSchedulerModule>;
