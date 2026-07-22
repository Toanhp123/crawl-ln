import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import JSZip from 'jszip';
import { SourcePluginPackageVerifier } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';

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
  entrySource?: string | Uint8Array;
  checksumOverride?: string;
  unixPermissions?: number;
  extraFiles?: Array<{ name: string; content: string | Uint8Array; unixPermissions?: number }>;
}) {
  const zip = new JSZip();
  const entryName = input.entryName ?? 'dist/index.js';
  const entrySource = input.entrySource ?? 'export default () => ({})';
  const manifestSource = JSON.stringify(manifest);
  zip.file('manifest.json', manifestSource);
  zip.file(entryName, entrySource, { unixPermissions: input.unixPermissions });
  for (const extra of input.extraFiles ?? []) {
    zip.file(extra.name, extra.content, { unixPermissions: extra.unixPermissions });
  }
  const checksums: Record<string, string> = {
    'manifest.json': sha256(manifestSource),
    [entryName]: input.checksumOverride ?? sha256(entrySource)
  };
  for (const extra of input.extraFiles ?? []) checksums[extra.name] = sha256(extra.content);
  zip.file('checksums.json', JSON.stringify(checksums));
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
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

test('verifier rejects native addons and executable binary magic', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  await assert.rejects(
    async () =>
      verifier.verify(
        await packageBytes({ extraFiles: [{ name: 'dist/addon.node', content: 'native' }] })
      ),
    /native|forbidden|binary/i
  );
  await assert.rejects(
    async () =>
      verifier.verify(
        await packageBytes({
          entrySource: Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0])
        })
      ),
    /executable|binary/i
  );
  await assert.rejects(
    async () =>
      verifier.verify(
        await packageBytes({ entrySource: Uint8Array.from([0x4d, 0x5a, 0, 0, 0, 0]) })
      ),
    /executable|binary/i
  );
});

test('verifier rejects executable mode bits and symbolic links', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  await assert.rejects(
    async () => verifier.verify(await packageBytes({ unixPermissions: 0o100755 })),
    /executable|permission/i
  );
  await assert.rejects(
    async () =>
      verifier.verify(
        await packageBytes({
          extraFiles: [
            {
              name: 'dist/link.js',
              content: '../../outside.js',
              unixPermissions: 0o120777
            }
          ]
        })
      ),
    /symbolic|symlink|link/i
  );
});
