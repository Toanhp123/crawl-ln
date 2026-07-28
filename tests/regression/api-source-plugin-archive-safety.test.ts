import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import {
  loadSafeSourcePluginArchive,
  SOURCE_PLUGIN_ARCHIVE_LIMITS
} from '../../apps/api/src/modules/source-reader/infrastructure/plugins/archive/source-plugin-archive-safety.ts';

interface ArchiveFile {
  path: string;
  content?: string | Uint8Array;
  unixPermissions?: number;
}

async function archive(files: ArchiveFile[], compressionLevel = 9): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content ?? 'content', {
      unixPermissions: file.unixPermissions ?? 0o100644
    });
  }
  return zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel }
  });
}

test('safe source plugin archives expose bounded lazy file readers', async () => {
  const loaded = await loadSafeSourcePluginArchive(
    await archive([
      { path: 'manifest.json', content: '{"id":"fixture"}' },
      { path: 'src/index.ts', content: 'export default {}' }
    ])
  );

  assert.deepEqual(
    loaded.entries.map((entry) => entry.path),
    ['manifest.json', 'src/index.ts']
  );
  assert.equal(Buffer.from(await loaded.entries[0]!.read()).toString('utf8'), '{"id":"fixture"}');
  assert.ok(loaded.entries.every((entry) => entry.compressedBytes > 0));
  assert.deepEqual(
    loaded.entries.map((entry) => entry.uncompressedBytes),
    [16, 17]
  );
});

test('source plugin archive safety rejects unsafe path forms before reading files', async () => {
  for (const path of [
    '../manifest.json',
    '/manifest.json',
    'C:/manifest.json',
    'src\\index.ts',
    'src/./index.ts',
    'src//index.ts',
    'src/invalid\0name.ts'
  ]) {
    await assert.rejects(
      async () => loadSafeSourcePluginArchive(await archive([{ path }])),
      /unsafe.*path/i,
      path
    );
  }
});

test('source plugin archive safety rejects symbolic links and executable permissions', async () => {
  await assert.rejects(
    async () =>
      loadSafeSourcePluginArchive(
        await archive([{ path: 'src/link.ts', unixPermissions: 0o120777 }])
      ),
    /symbolic link/i
  );
  await assert.rejects(
    async () =>
      loadSafeSourcePluginArchive(
        await archive([{ path: 'src/index.ts', unixPermissions: 0o100755 }])
      ),
    /executable permission/i
  );
});

test('source plugin archive safety enforces compressed size and entry limits', async () => {
  await assert.rejects(
    () =>
      loadSafeSourcePluginArchive(new Uint8Array(SOURCE_PLUGIN_ARCHIVE_LIMITS.maxArchiveBytes + 1)),
    /size limit/i
  );

  const files = Array.from({ length: SOURCE_PLUGIN_ARCHIVE_LIMITS.maxEntries + 1 }, (_, index) => ({
    path: `file-${index}.ts`,
    content: ''
  }));
  await assert.rejects(
    async () => loadSafeSourcePluginArchive(await archive(files)),
    /too many entries/i
  );
});

test('source plugin archive safety rejects excessive expanded bytes', async () => {
  const content = new Uint8Array(SOURCE_PLUGIN_ARCHIVE_LIMITS.maxUncompressedBytes + 1);
  let state = 0x12345678;
  for (let index = 0; index < content.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    content[index] = (state >>> 24) & 0b11;
  }

  await assert.rejects(
    async () => loadSafeSourcePluginArchive(await archive([{ path: 'large.bin', content }], 1)),
    /expands beyond limit/i
  );
});

test('source plugin archive safety rejects unsafe compression ratios', async () => {
  await assert.rejects(
    async () =>
      loadSafeSourcePluginArchive(
        await archive([{ path: 'compressed.bin', content: new Uint8Array(1024 * 1024) }])
      ),
    /compression ratio/i
  );
});
