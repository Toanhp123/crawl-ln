import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'apps/web-legacy/src/entities/source-plugin/api/sourcePluginApi.ts',
  'apps/web-legacy/src/features/manage-source-plugins/model/useSourcePluginActions.ts',
  'apps/web-legacy/src/features/manage-source-plugins/ui/SourcePluginActions.tsx',
  'apps/web-legacy/src/widgets/source-reader-overview/ui/SourceReaderOverview.tsx',
  'apps/web-legacy/src/pages/sources/model/useSourcesPage.ts',
  'apps/web-legacy/src/pages/sources/ui/SourcesPage.tsx'
];

test('Sources console uses Source Reader APIs and retains optimistic plugin switches', () => {
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.match(source, /source-reader\/plugins/);
  assert.match(source, /onMutate/);
  assert.match(source, /onError/);
  assert.match(source, /onCheckedChange/);
  assert.doesNotMatch(source, /\/api\/plugins(?:\/|['"])/);
});

test('Sources console composes all user-facing Source Reader sections', () => {
  const source = readFileSync('apps/web-legacy/src/pages/sources/ui/SourcesPage.tsx', 'utf8');
  for (const section of ['plugins', 'credentials', 'network', 'challenges', 'inspector']) {
    assert.match(source, new RegExp(`id: '${section}'`));
  }
  for (const widget of [
    'SourceReaderOverview',
    'SourceCredentialsPanel',
    'SourceNetworkProfilesPanel',
    'SourceAuthChallengesPanel',
    'SourceInspector'
  ]) {
    assert.match(source, new RegExp(widget));
  }
});
