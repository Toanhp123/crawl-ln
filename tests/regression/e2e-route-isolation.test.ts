import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const RUNTIME_FIXTURE = new URL('../e2e/runtime.fixture.ts', import.meta.url);
const BUTTON_FEEDBACK_SPEC = new URL('../e2e/button-loading-feedback.spec.ts', import.meta.url);
const LIBRARY_STABILITY_SPEC = new URL('../e2e/library-loading-stability.spec.ts', import.meta.url);
const WEB_READER_SPEC = new URL('../e2e/web-reader-parity.spec.ts', import.meta.url);

test('shared E2E runtime fixture owns stable background API mocks', async () => {
  const source = await readFile(RUNTIME_FIXTURE, 'utf8');

  assert.match(source, /interface\s+E2eRuntimeOptions/);
  assert.match(source, /mockNovels\?:\s*boolean/);
  assert.match(source, /page\.route\(['"]\*\*\/api\/events['"]/);
  assert.match(source, /page\.route\(['"]\*\*\/api\/tasks\/summary['"]/);
  assert.match(source, /api\\\/novels/);
  assert.match(source, /status:\s*204/);
  assert.match(source, /activeCount:\s*0/);
  assert.match(source, /items:\s*\[\]/);
});

test('feature E2E specs do not duplicate shared background routes', async () => {
  const [button, webReader] = await Promise.all([
    readFile(BUTTON_FEEDBACK_SPEC, 'utf8'),
    readFile(WEB_READER_SPEC, 'utf8')
  ]);

  for (const source of [button, webReader]) {
    assert.doesNotMatch(source, /page\.route\(['"]\*\*\/api\/events['"]/);
    assert.doesNotMatch(source, /page\.route\(['"]\*\*\/api\/tasks\/summary['"]/);
  }
  assert.doesNotMatch(button, /page\.route\(['"]\*\*\/api\/\*\*['"]/);
  assert.match(button, /page\.route\(['"]\*\*\/api\/source-reader\/\*\*['"]/);
});

test('library loading stability keeps ownership of its delayed novels response', async () => {
  const source = await readFile(LIBRARY_STABILITY_SPEC, 'utf8');
  assert.match(source, /installE2eRuntime\(page,\s*\{\s*mockNovels:\s*false\s*\}\)/);
});
