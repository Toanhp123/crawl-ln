import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveSourcePluginToggleRequest } from '../../apps/web/src/features/manage-source-plugins/model/resolve-source-plugin-toggle-request.ts';

test('pending permission enable requests open review instead of toggling the plugin', () => {
  assert.deepEqual(
    resolveSourcePluginToggleRequest({ enabled: false, permissionsPending: true }, true),
    { kind: 'review-permissions' }
  );
  assert.deepEqual(
    resolveSourcePluginToggleRequest({ enabled: false, permissionsPending: false }, true),
    { kind: 'toggle', enabled: true }
  );
  assert.deepEqual(
    resolveSourcePluginToggleRequest({ enabled: true, permissionsPending: true }, false),
    { kind: 'toggle', enabled: false }
  );
});

test('Sources plugin list uses a compact switch and keeps the long permission warning in a modal', async () => {
  const [actions, overview] = await Promise.all([
    readFile('apps/web/src/features/manage-source-plugins/ui/SourcePluginActions.tsx', 'utf8'),
    readFile('apps/web/src/widgets/source-reader-overview/ui/SourceReaderOverview.tsx', 'utf8')
  ]);

  assert.match(overview, /<SourcePluginEnableSwitch plugin=\{plugin\} compact \/>/);
  assert.match(actions, /label=\{compact \? undefined :/);
  assert.match(actions, /className=\{compact \? 'w-auto border-0 p-0 hover:bg-transparent'/);
  assert.doesNotMatch(actions, /description=\{approvalRequired/);
  assert.match(actions, /<Modal/);
  assert.match(actions, /resolveSourcePluginToggleRequest\(plugin, enabled\)/);
});
