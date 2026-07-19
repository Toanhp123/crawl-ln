import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import JSZip from 'jszip';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';

const manifest = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'],
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['example.test'], priority: 10 }],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['example.test'] } }
} as const;

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

async function packageBytes(input: {
  entryName?: string;
  entrySource?: string;
  checksumOverride?: string;
}) {
  const zip = new JSZip();
  const entryName = input.entryName ?? 'dist/index.js';
  const entrySource = input.entrySource ?? 'export default () => ({})';
  const manifestSource = JSON.stringify(manifest);
  zip.file('manifest.json', manifestSource);
  zip.file(entryName, entrySource);
  zip.file(
    'checksums.json',
    JSON.stringify({
      'manifest.json': sha256(manifestSource),
      [entryName]: input.checksumOverride ?? sha256(entrySource)
    })
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('verifier rejects archive traversal before extraction', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  const bytes = await packageBytes({ entryName: '../escape.js' });
  await assert.rejects(() => verifier.verify(bytes), /path/i);
});

test('verifier rejects a checksum mismatch', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  const bytes = await packageBytes({ checksumOverride: '0'.repeat(64) });
  await assert.rejects(() => verifier.verify(bytes), /checksum mismatch/i);
});

test('unsigned package is local-unverified and forced into isolation', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  const verified = await verifier.verify(await packageBytes({}));
  assert.equal(verified.signatureStatus, 'unsigned');
  assert.equal(verified.trustLevel, 'local-unverified');
  assert.equal(verified.executionMode, 'isolated');
  assert.equal(verified.manifest.id, 'demo');
  assert.ok(verified.files.has('dist/index.js'));
});
