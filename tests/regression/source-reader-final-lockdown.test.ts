import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const legacyEnv = ['SOURCE', 'PROFILES', 'FILE'].join('_');
const legacyConfigName = ['source', 'profiles.json'].join('-');
const legacyEndpoint = ['/api', 'plugins'].join('/');
const legacyModulePath = ['apps/api-legacy/src/modules', 'plugin'].join('/');

test('repository documents and enforces only Source Reader', () => {
  const readme = readFileSync('README.md', 'utf8');
  const sourceReader = readFileSync('docs/SOURCE_READER.md', 'utf8');
  const verifier = readFileSync(
    'apps/api-legacy/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts',
    'utf8'
  );
  const supervisor = readFileSync(
    'apps/api-legacy/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts',
    'utf8'
  );

  assert.match(readme, /Source Reader/);
  assert.match(sourceReader, /\.source-plugin/);
  assert.match(sourceReader, /SOURCE_READER_MASTER_KEY/);
  assert.match(verifier, /Symbolic links are forbidden/);
  assert.match(verifier, /Executable binary content is forbidden/);
  assert.match(supervisor, /PLUGIN_RPC_PROTOCOL_INVALID/);
  assert.equal(readme.includes(legacyEnv), false);
  assert.equal(readme.includes(legacyConfigName), false);
  assert.equal(readme.includes(legacyEndpoint), false);
  assert.equal(existsSync(['apps/api-legacy/config', legacyConfigName].join('/')), false);
  assert.equal(existsSync(legacyModulePath), false);
});
