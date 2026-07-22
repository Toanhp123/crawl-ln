import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('API depends on and re-exports canonical source plugin SDK contracts', () => {
  const apiPackage = JSON.parse(read('apps/api-legacy/package.json')) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(
    apiPackage.dependencies?.['@novel-tool/source-plugin-sdk'],
    'file:../../packages/source-plugin-sdk'
  );

  const models = read('apps/api-legacy/src/modules/source-reader/public/source-reader.models.ts');
  assert.match(models, /from '@novel-tool\/source-plugin-sdk'/);
  assert.doesNotMatch(models, /export interface NovelMetadata/);
  assert.doesNotMatch(models, /export interface ChapterSummary/);
  assert.doesNotMatch(models, /export type SourceCapability/);
  assert.doesNotMatch(models, /SourceReaderData/);
});

test('internal plugin domain imports manifest and operation result from SDK', () => {
  const plugin = read('apps/api-legacy/src/modules/source-reader/domain/plugin/source-plugin.ts');
  assert.match(plugin, /from '@novel-tool\/source-plugin-sdk'/);
  assert.doesNotMatch(plugin, /export interface SourcePluginManifest/);
  assert.doesNotMatch(plugin, /export interface PluginOperationResult/);
  assert.doesNotMatch(plugin, /export interface PluginMatcher/);
  assert.doesNotMatch(plugin, /SourcePluginExecutionMode/);
});

test('manifest validation uses SDK capability constants', () => {
  const schema = read(
    'apps/api-legacy/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts'
  );
  assert.match(schema, /SOURCE_CAPABILITIES/);
  assert.match(schema, /z\.enum\(SOURCE_CAPABILITIES\)/);
  assert.doesNotMatch(schema, /z\.enum\(\[\s*'identify'/);
});

test('authentication lifecycle and external RPC contracts are re-exported from SDK', () => {
  const auth = read('apps/api-legacy/src/modules/source-reader/domain/auth/authentication.ts');
  const lifecycle = read(
    'apps/api-legacy/src/modules/source-reader/domain/plugin/plugin-lifecycle.ts'
  );
  const rpc = read('apps/api-legacy/src/modules/source-reader/domain/plugin/external-auth-rpc.ts');

  for (const source of [auth, lifecycle, rpc]) {
    assert.match(source, /@novel-tool\/source-plugin-sdk/);
  }
  assert.doesNotMatch(auth, /export interface AuthSessionMaterial/);
  assert.doesNotMatch(lifecycle, /export interface PluginLifecycleContext/);
  assert.doesNotMatch(rpc, /export interface ExternalProbeRequest/);
});

test('sandbox dispatch receives the SDK capability method mapping from the host', () => {
  const sandbox = read(
    'apps/api-legacy/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-entry.mjs'
  );
  const supervisor = read(
    'apps/api-legacy/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts'
  );

  assert.match(supervisor, /SOURCE_CAPABILITY_METHODS/);
  assert.match(
    supervisor,
    /SOURCE_READER_CAPABILITY_METHODS:\s*JSON\.stringify\(SOURCE_CAPABILITY_METHODS\)/
  );
  assert.match(sandbox, /process\.env\.SOURCE_READER_CAPABILITY_METHODS/);
  assert.doesNotMatch(sandbox, /authentication:\s*'authenticate'/);
  assert.doesNotMatch(sandbox, /from '@novel-tool\/source-plugin-sdk'/);
});
