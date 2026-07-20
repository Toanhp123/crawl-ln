import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const legacyEnv = ['SOURCE', 'PROFILES', 'FILE'].join('_');
const legacyConfigName = ['source', 'profiles.json'].join('-');
const legacyEndpoint = ['/api', 'plugins'].join('/');
const legacyModulePath = ['apps/api/src/modules', 'plugin'].join('/');

test('repository documents and enforces only Source Reader', () => {
  const readme = readFileSync('README.md', 'utf8');
  const sourceReader = readFileSync('docs/SOURCE_READER.md', 'utf8');
  const remediation = readFileSync(
    'docs/superpowers/specs/2026-07-20-source-reader-security-remediation-design.md',
    'utf8'
  );
  assert.match(readme, /Source Reader/);
  assert.match(sourceReader, /\.source-plugin/);
  assert.match(sourceReader, /SOURCE_READER_MASTER_KEY/);
  assert.match(remediation, /deny-by-default/);
  assert.match(remediation, /fail-closed/);
  assert.equal(readme.includes(legacyEnv), false);
  assert.equal(readme.includes(legacyConfigName), false);
  assert.equal(readme.includes(legacyEndpoint), false);
  assert.equal(existsSync(['apps/api/config', legacyConfigName].join('/')), false);
  assert.equal(existsSync(legacyModulePath), false);
});
