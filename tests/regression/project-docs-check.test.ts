import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

    const { checkDocumentation } = await import('../../scripts/lib/documentation.mjs');
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
    await write(root, 'docs/TERMUX_ACCEPTANCE.md', '# Termux acceptance\n');
    await write(
      root,
      'docs/ARCHITECTURE.md',
      '# Architecture\n\nSource Reader plugins ingest content.\n'
    );
    await write(root, 'CHANGELOG.md', '# Changelog\n\nOld source profile support was removed.\n');

    const { checkDocumentation } = await import('../../scripts/lib/documentation.mjs');
    const result = await checkDocumentation(root);

    assert.deepEqual(result, { ok: true, errors: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('documentation check ignores generated artifact snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-docs-artifacts-'));
  try {
    await write(root, 'README.md', '# Project\n\n[Docs](docs/README.md)\n');
    await write(root, 'docs/README.md', '# Docs\n');
    await write(root, 'docs/TERMUX_ACCEPTANCE.md', '# Termux acceptance\n');
    await write(root, '.artifacts/v3/backup/README.md', '[Missing](nowhere.md)\n');

    const { checkDocumentation } = await import('../../scripts/lib/documentation.mjs');
    assert.deepEqual(await checkDocumentation(root), { ok: true, errors: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('active documentation and CI use only the eight-command interface', async () => {
  const { readFile } = await import('node:fs/promises');
  const [readme, docsIndex, workflow, playwright, termux] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('docs/README.md', 'utf8'),
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('playwright.config.ts', 'utf8'),
    readFile('docs/TERMUX_ACCEPTANCE.md', 'utf8')
  ]);

  for (const command of ['setup', 'dev', 'build', 'start', 'check', 'test', 'format', 'clean']) {
    assert.match(readme, new RegExp(`npm (?:run )?${command}`));
  }

  const removedAliases = [
    ['dev', 'api'].join(':'),
    ['build', 'web'].join(':'),
    ['test', 'e2e'].join(':'),
    ['ver', 'ify'].join(''),
    ['re', 'hearse'].join(''),
    ['cut', 'over'].join(''),
    ['roll', 'back'].join('')
  ];
  assert.doesNotMatch(readme, new RegExp(removedAliases.join('|'), 'i'));

  const removedRunbooks = [['V3', 'CUTOVER'].join('_'), ['V3', 'ROLLBACK'].join('_')];
  assert.doesNotMatch(docsIndex, new RegExp(removedRunbooks.join('|')));
  assert.match(docsIndex, /TERMUX_ACCEPTANCE\.md/);

  assert.match(workflow, /npm run setup/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run setup -- --browser/);
  assert.match(workflow, /npm test -- --suite e2e/);
  for (const runner of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    assert.match(workflow, new RegExp(runner));
  }

  assert.match(playwright, /npm run dev -- --target web/);
  assert.match(termux, /npm run setup/);
  assert.match(termux, /npm run check/);
  assert.match(termux, /npm test/);
  assert.match(termux, /npm run build/);
  assert.match(termux, /npm run dev/);
});

test('NovelCool documentation publishes the external plugin installation boundary', async () => {
  const [readme, sourceReaderDocs] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('docs/SOURCE_READER.md', 'utf8')
  ]);

  assert.match(readme, /dist\/plugins\/novelcool-2\.0\.0\.source-plugin/);
  assert.match(sourceReaderDocs, /manual(?:ly)? install/i);
  assert.match(sourceReaderDocs, /local-unverified/i);
  assert.match(sourceReaderDocs, /isolated/i);
  assert.match(sourceReaderDocs, /no built-in fallback/i);
  assert.match(sourceReaderDocs, /latestVersion/);
  assert.match(sourceReaderDocs, /activeVersion/);
  assert.match(sourceReaderDocs, /Install\s*->\s*Approve\s*->\s*Enable/i);
  assert.match(sourceReaderDocs, /discovers? plugin workspaces without provider-specific code/i);
});

test('frontend docs publish the shared theme and Settings control contract', async () => {
  const [index, contract] = await Promise.all([
    readFile('docs/README.md', 'utf8'),
    readFile('docs/frontend/SHARED_THEME_CONTRACT.md', 'utf8')
  ]);
  assert.match(index, /SHARED_THEME_CONTRACT\.md/);
  for (const requirement of [
    '44 CSS pixels',
    'SettingsChoiceGroup',
    'SettingsOptionList',
    'SegmentedControl',
    'shared/ui',
    'shared/theme',
    'compact',
    'comfortable',
    'prefers-reduced-motion'
  ]) {
    assert.match(contract, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(contract, /must not define a shared control height inside a feature/i);
});

test('Phase 2C architecture and E2E acceptance documentation remain complete', async () => {
  const [architecture, e2e, changelog] = await Promise.all([
    readFile('docs/ARCHITECTURE.md', 'utf8'),
    readFile('docs/E2E_TEST_CHECKLIST.md', 'utf8'),
    readFile('CHANGELOG.md', 'utf8')
  ]);

  for (const requirement of [
    'backup-control.sqlite',
    'backup-temp',
    'operation',
    'session',
    'globally',
    'Merge Restore',
    'Replace Restore',
    '.rollback',
    'backup` resource',
    'never resumed automatically'
  ]) {
    assert.match(
      architecture,
      new RegExp(requirement.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'i')
    );
  }
  const matrix = e2e.match(/^\d+\. /gm) ?? [];
  assert.ok(matrix.length >= 18);
  assert.match(e2e, /THAY THẾ DỮ LIỆU/);
  assert.match(e2e, /reload exactly once/i);
  assert.match(changelog, /Phase 2C Backup and Restore/);
  assert.equal((changelog.match(/Phase 2C Backup and Restore/g) ?? []).length, 1);
});

test('README and changelog publish the current route and release boundaries', async () => {
  const [readme, router, changelog] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('apps/web/src/app/router/AppRouter.tsx', 'utf8'),
    readFile('CHANGELOG.md', 'utf8')
  ]);

  for (const route of [
    '/library',
    '/library/:novelId',
    '/activity',
    '/activity/:taskId',
    '/sources',
    '/settings'
  ]) {
    assert.match(router, new RegExp(route.replaceAll('/', '\\/')));
    assert.match(readme, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(router, /path="read\/:chapterIndex"/);
  assert.match(readme, /\/library\/:novelId\/read\/:chapterIndex/);
  assert.match(readme, /legacy.*(?:crawl|tasks).*redirect/i);
  assert.equal((changelog.match(/^# Changelog$/gm) ?? []).length, 1);
  assert.equal((changelog.match(/^## 2\.9\.4 - Final Logic Cleanup$/gm) ?? []).length, 1);
  assert.ok(changelog.indexOf('## Unreleased') < changelog.indexOf('## 3.0.0'));
  assert.ok(changelog.indexOf('## 3.0.0') < changelog.indexOf('## 2.9.6'));
});
