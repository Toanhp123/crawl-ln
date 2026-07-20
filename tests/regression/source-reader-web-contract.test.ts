import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts',
  'apps/web/src/pages/sources/model/useSourcesPage.ts',
  'apps/web/src/pages/sources/ui/SourceProfileCard.tsx'
];

test('Sources UI uses Source Reader API and retains optimistic switches', () => {
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.match(source, /source-reader\/plugins/);
  assert.match(source, /onMutate/);
  assert.match(source, /onError/);
  assert.doesNotMatch(source, /\/api\/plugins/);
  assert.match(source, /onCheckedChange/);
  assert.doesNotMatch(source, /\/api\/plugins(?:\/|['"])/);
});
