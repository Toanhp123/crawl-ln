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

test('source manager exposes health, lifecycle actions, and a two-level detail view', () => {
  const page = read('apps/web/src/pages/sources/ui/SourcesPage.tsx');
  const overview = read('apps/web/src/widgets/source-reader-overview/ui/SourceReaderOverview.tsx');
  const row = read('apps/web/src/entities/source-plugin/ui/SourcePluginRow.tsx');
  const detailPage = read('apps/web/src/pages/sources/ui/SourcePluginPage.tsx');
  const detail = read('apps/web/src/widgets/source-plugin-details/ui/SourcePluginDetails.tsx');

  assert.match(page, /SourceReaderOverview/);
  assert.match(overview, /SourcePluginEnableSwitch/);
  assert.match(overview, /\/sources\/\$\{encodeURIComponent\(plugin\.id\)\}/);
  assert.match(row, /sourcePluginTone\(plugin\)/);
  assert.match(detail, /useSourcePluginHealthQuery/);
  assert.match(detail, /plugin\.trustLevel/);
  assert.match(detail, /ReviewSourcePermissions/);
  assert.match(detailPage, /SourcePluginDetails/);
  assert.doesNotMatch(detail, /lastError|stack|packagePath/);
});
