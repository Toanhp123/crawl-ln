import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import JSZip from 'jszip';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';
import { packageFirstPartySourcePlugin } from '../../scripts/cli/lib/first-party-source-plugin.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workspaceRoot = join(root, 'plugins', 'novelcool');

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function archiveContents(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name]!.dir)
    .sort();
  const contents = new Map<string, Uint8Array>();
  for (const name of names) contents.set(name, await zip.file(name)!.async('uint8array'));
  return { zip, names, contents };
}

test('first-party packager emits a verifier-approved three-file NovelCool artifact', async (t) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'novelcool-package-'));
  t.after(() => rm(outputDirectory, { recursive: true, force: true }));
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));

  const result = await packageFirstPartySourcePlugin({
    root,
    workspaceRoot,
    outputDirectory,
    verifier
  });

  assert.equal(result.artifactPath, join(outputDirectory, 'novelcool-2.0.0.source-plugin'));
  assert.deepEqual(new Uint8Array(await readFile(result.artifactPath)), result.bytes);
  const archive = await archiveContents(result.bytes);
  assert.deepEqual(archive.names, ['checksums.json', 'dist/index.js', 'manifest.json']);
  const checksums = JSON.parse(
    Buffer.from(archive.contents.get('checksums.json')!).toString('utf8')
  ) as Record<string, string>;
  assert.deepEqual(Object.keys(checksums), ['dist/index.js', 'manifest.json']);
  assert.equal(checksums['dist/index.js'], sha256(archive.contents.get('dist/index.js')!));
  assert.equal(checksums['manifest.json'], sha256(archive.contents.get('manifest.json')!));
  assert.equal(result.verified.signatureStatus, 'unsigned');
  assert.equal(result.verified.trustLevel, 'local-unverified');
  assert.equal(result.verified.executionMode, 'isolated');
  assert.equal(result.verified.manifest.id, 'novelcool');
  assert.equal(result.verified.manifest.version, '2.0.0');
  assert.doesNotMatch(
    Buffer.from(archive.contents.get('dist/index.js')!).toString('utf8'),
    /(?:from\s+|import\()\s*['"](?![./])/
  );
});

test('repeated packaging keeps semantic contents stable and checksum tampering is rejected', async (t) => {
  const firstOutput = await mkdtemp(join(tmpdir(), 'novelcool-package-first-'));
  const secondOutput = await mkdtemp(join(tmpdir(), 'novelcool-package-second-'));
  t.after(() => rm(firstOutput, { recursive: true, force: true }));
  t.after(() => rm(secondOutput, { recursive: true, force: true }));
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));

  const first = await packageFirstPartySourcePlugin({
    root,
    workspaceRoot,
    outputDirectory: firstOutput,
    verifier
  });
  const second = await packageFirstPartySourcePlugin({
    root,
    workspaceRoot,
    outputDirectory: secondOutput,
    verifier
  });
  const firstArchive = await archiveContents(first.bytes);
  const secondArchive = await archiveContents(second.bytes);
  assert.deepEqual(firstArchive.names, secondArchive.names);
  for (const name of firstArchive.names) {
    assert.deepEqual(firstArchive.contents.get(name), secondArchive.contents.get(name), name);
  }

  firstArchive.zip.file('dist/index.js', 'export default { tampered: true };');
  const tampered = await firstArchive.zip.generateAsync({ type: 'uint8array', platform: 'UNIX' });
  await assert.rejects(() => verifier.verify(tampered), /checksum mismatch/i);
});
