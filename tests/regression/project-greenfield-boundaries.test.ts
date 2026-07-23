import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('active runtime and retained tests satisfy greenfield boundaries', async () => {
  const { checkRepositoryBoundaries } =
    await import('../../scripts/cli/lib/repository-boundaries.mjs');
  assert.deepEqual(await checkRepositoryBoundaries(process.cwd(), { scope: 'runtime' }), []);
});

test('reading positions use only the current identity schema and canonical keys', async () => {
  const source =
    await import('../../apps/web/src/features/read-chapter/lib/reading-position-storage.ts');
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value)
  } as Storage;
  const position = {
    schemaVersion: 1 as const,
    novelId: 'novel-1',
    chapterId: 'chapter-1',
    chapterIndex: 0,
    paragraphId: 'p-1',
    paragraphOffset: 0,
    scrollRatio: 0.5,
    updatedAt: '2026-07-23T00:00:00.000Z'
  };
  source.saveReadingPosition(position, storage);
  assert.deepEqual(
    source.readReadingPosition('novel-1', { id: 'chapter-1', index: 0 }, storage),
    position
  );
  assert.equal(
    [...memory.keys()].some((key) => /:v[123]\b/.test(key)),
    false
  );
});

test('runtime boundary detects removed role, storage, and route terminology', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'apps', 'api', 'src');
  await mkdir(sourceRoot, { recursive: true });
  const removed = [['api', 'next'].join('-'), ['v', '22'].join(''), ['vpn', 'gateway'].join('-')];
  await writeFile(join(sourceRoot, 'fixture.ts'), removed.join(' '));
  const { checkRepositoryBoundaries } =
    await import('../../scripts/cli/lib/repository-boundaries.mjs');
  const errors = await checkRepositoryBoundaries(root, { scope: 'runtime' });
  for (const token of removed) {
    assert.equal(
      errors.some((error) => error.includes(token)),
      true,
      token
    );
  }
});
