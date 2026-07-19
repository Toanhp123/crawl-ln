import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('settings phase 4 provides task-oriented hub and health summary', () => {
  const page = read('apps/web/src/pages/settings/ui/SettingsPage.tsx');
  const health = read('apps/web/src/widgets/system-health/ui/SystemHealthCard.tsx');
  assert.match(page, /SettingsHubCard/);
  assert.match(page, /SystemHealthCard/);
  assert.match(health, /schedulerHealthy/);
  assert.match(health, /settings\.healthDatabase/);
  assert.doesNotMatch(health, /pluginIssues|pluginCount|settings\.healthPlugins/);
  assert.doesNotMatch(page, /model\.plugins|pluginIssues/);
});

test('backup restore requires a review step before destructive restore', () => {
  const panel = read('apps/web/src/features/backup-library/ui/BackupRestorePanel.tsx');
  assert.match(panel, /restoreStep/);
  assert.match(panel, /review/);
  assert.match(panel, /selectedFile/);
  assert.match(panel, /confirmRestore/);
});

test('source manager exposes human-readable health and a two-level detail view', () => {
  const page = read('apps/web/src/pages/sources/ui/SourcesPage.tsx');
  const card = read('apps/web/src/pages/sources/ui/SourceProfileCard.tsx');
  const detail = read('apps/web/src/pages/sources/ui/SourceProfilePage.tsx');
  assert.match(page, /reload\.mutate/);
  assert.match(page, /toggle\.mutate/);
  assert.match(card, /plugin\.health\.successCount/);
  assert.match(card, /plugin\.health\.failureCount/);
  assert.match(detail, /sources\.profile\.advanced/);
  assert.match(detail, /plugin\.health\.lastError/);
});
