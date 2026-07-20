import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function write(root: string, path: string, content: string) {
  const absolute = join(root, path);
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeFile(absolute, content);
}

test('documentation check reports dead links, retired terminology, history directories, and duplicates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-docs-invalid-'));
  try {
    await write(root, 'README.md', '# Project\n\n[Missing](docs/MISSING.md)\n');
    await write(root, 'docs/README.md', '# Docs\n');
    await write(
      root,
      'docs/ARCHITECTURE.md',
      'Configure the JSON source profile for crawling.\n\n[Missing nested](MISSING-NESTED.md)\n'
    );
    await write(root, 'docs/archive/old.md', '# Old\n');
    const duplicate =
      '# Duplicate\n\nThis document contains enough repeated content to be treated as a real duplicate.\n';
    await write(root, 'docs/a.md', duplicate);
    await write(root, 'docs/b.md', duplicate);

    const { checkDocumentation } = await import('../../scripts/check-docs.mjs');
    const result = await checkDocumentation(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error: string) => error.includes('docs/MISSING.md')));
    assert.ok(result.errors.some((error: string) => error.includes('MISSING-NESTED.md')));
    assert.ok(result.errors.some((error: string) => error.includes('retired source-profile')));
    assert.ok(result.errors.some((error: string) => error.includes('docs/archive')));
    assert.ok(result.errors.some((error: string) => error.includes('duplicate Markdown')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('documentation check accepts canonical current docs and ignores historical changelog wording', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-docs-valid-'));
  try {
    await write(root, 'README.md', '# Project\n\n[Docs](docs/README.md)\n');
    await write(root, 'docs/README.md', '# Docs\n\n[Architecture](ARCHITECTURE.md)\n');
    await write(
      root,
      'docs/ARCHITECTURE.md',
      '# Architecture\n\nSource Reader plugins ingest content.\n'
    );
    await write(root, 'CHANGELOG.md', '# Changelog\n\nOld source profile support was removed.\n');

    const { checkDocumentation } = await import('../../scripts/check-docs.mjs');
    const result = await checkDocumentation(root);

    assert.deepEqual(result, { ok: true, errors: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
