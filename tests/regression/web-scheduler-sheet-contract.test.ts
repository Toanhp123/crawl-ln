import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('useRunScheduler owns invalidation but no presentation toast', async () => {
  const source = await readFile(
    'apps/web/src/features/run-scheduler/model/use-run-scheduler.ts',
    'utf8'
  );

  assert.match(source, /schedulerInvalidation\.invalidateAll/);
  assert.match(source, /novelInvalidation\.invalidateList/);
  assert.match(source, /taskInvalidation\.invalidateAll/);
  assert.doesNotMatch(source, /\btoast\b|useI18n|scheduler\.completed|scheduler\.failed/);
});

test('Scheduler feature components consume shared StatusList and pure models', async () => {
  const [statusSource, timingSource] = await Promise.all([
    readFile('apps/web/src/features/run-scheduler/ui/SchedulerStatusList.tsx', 'utf8'),
    readFile('apps/web/src/features/run-scheduler/ui/SchedulerTimingCard.tsx', 'utf8')
  ]);

  assert.match(statusSource, /StatusList/);
  assert.match(statusSource, /getSchedulerDisplayState/);
  assert.match(timingSource, /StatusList/);
  assert.match(timingSource, /formatSchedulerTimestamp/);
  assert.match(timingSource, /setInterval/);
  assert.doesNotMatch(statusSource + timingSource, /useSchedulerStatus|useRunScheduler/);
});

test('SchedulerControls owns query, realtime fallback, inline feedback, and safe action gating', async () => {
  const source = await readFile(
    'apps/web/src/features/run-scheduler/ui/SchedulerControls.tsx',
    'utf8'
  );

  assert.match(source, /useConnectionStatus/);
  assert.match(source, /useSchedulerStatus\(\{[\s\S]*pollingIntervalMs:\s*15_000/);
  assert.match(source, /actionFeedbackPolicies\.longRunning\.successDurationMs/);
  assert.match(source, /SchedulerStatusList/);
  assert.match(source, /SchedulerTimingCard/);
  assert.match(source, /InlineNotice/);
  assert.match(source, /query\.refetch/);
  assert.match(source, /mutation\.isPending\s*\|\|\s*serverRunning/);
  assert.doesNotMatch(source, /\btoast\b/);
});

test('Settings renders SchedulerControls instead of the legacy action-only panel', async () => {
  const source = await readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8');

  assert.match(source, /import \{ SchedulerControls \} from ['"]@\/features\/run-scheduler['"]/);
  assert.match(source, /panel === ['"]scheduler['"] \? <SchedulerControls \/>/);
  assert.doesNotMatch(source, /RunSchedulerButton/);
});
