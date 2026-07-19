import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

test('non-critical crawler audit writes are published behind an application event boundary', () => {
  const runner = read(
    'apps/api/src/modules/crawler/application/services/crawl-job-runner.service.ts'
  );
  const createJob = read(
    'apps/api/src/modules/crawler/application/use-cases/create-crawl-job.usecase.ts'
  );
  const recoverJobs = read(
    'apps/api/src/modules/crawler/application/use-cases/recover-crawl-jobs.usecase.ts'
  );

  for (const source of [runner, createJob, recoverJobs]) {
    assert.doesNotMatch(source, /CrawlEventRepository/);
    assert.match(source, /CrawlAuditPublisherPort/);
  }
});

test('scheduler policy state remains synchronous while diagnostics are event subscribers', () => {
  const scheduler = read(
    'apps/api/src/modules/scheduler/application/auto-update-scheduler.service.ts'
  );
  assert.doesNotMatch(scheduler, /SchedulerDiagnosticsRepository/);
  assert.match(scheduler, /NovelUpdateDiagnosticPublisherPort/);
  assert.match(scheduler, /policies\.recordState/);
});

test('application event bus is technical infrastructure and event payloads remain module-owned', () => {
  const infrastructure = read('apps/api/src/shared/container/modules/infrastructure.module.ts');
  assert.match(infrastructure, /InMemoryApplicationEventBus/);

  const crawlerEvent = read('apps/api/src/modules/crawler/application/events/crawl-audit.event.ts');
  const schedulerEvent = read(
    'apps/api/src/modules/scheduler/application/events/scheduler-diagnostic.event.ts'
  );
  assert.match(crawlerEvent, /crawler\.audit\.recorded/);
  assert.match(schedulerEvent, /scheduler\.diagnostic\.recorded/);
});
