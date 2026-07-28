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
    await write(root, 'CONTRIBUTING.md', '# Contributing\n\nContributions are welcome.\n');
    await write(
      root,
      'docs/README.md',
      '# Docs\n\n[Getting started](GETTING_STARTED.md)\n[Configuration](CONFIGURATION.md)\n[Plugins](PLUGIN_DEVELOPMENT.md)\n[Security](SECURITY.md)\n'
    );
    for (const guide of [
      'GETTING_STARTED.md',
      'CONFIGURATION.md',
      'PLUGIN_DEVELOPMENT.md',
      'SECURITY.md'
    ]) {
      await write(root, `docs/${guide}`, `# ${guide}\n\nPublic guidance.\n`);
    }
    await write(root, '.internal/docs/private.md', '[Missing](nowhere.md)\n');
    await write(
      root,
      'CHANGELOG.md',
      '# Changelog\n\nOld source profile and Termux support were removed.\n'
    );

    const { checkDocumentation } = await import('../../scripts/lib/documentation.mjs');
    const result = await checkDocumentation(root);

    assert.deepEqual(result, { ok: true, errors: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('documentation check rejects Termux references in public Markdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-docs-termux-'));
  try {
    for (const path of [
      'README.md',
      'CONTRIBUTING.md',
      'docs/README.md',
      'docs/GETTING_STARTED.md',
      'docs/CONFIGURATION.md',
      'docs/PLUGIN_DEVELOPMENT.md',
      'docs/SECURITY.md'
    ]) {
      await write(root, path, `# ${path}\n\nPublic guidance.\n`);
    }
    await write(root, 'docs/TERMUX.md', '# Mobile setup\n\nTermux is not a supported setup path.\n');

    const { checkDocumentation } = await import('../../scripts/lib/documentation.mjs');
    const result = await checkDocumentation(root);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error: string) => error.includes('Termux')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('documentation check ignores generated artifact snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-docs-artifacts-'));
  try {
    await write(root, 'README.md', '# Project\n\n[Docs](docs/README.md)\n');
    await write(root, 'CONTRIBUTING.md', '# Contributing\n');
    await write(root, 'docs/README.md', '# Docs\n');
    for (const guide of [
      'GETTING_STARTED.md',
      'CONFIGURATION.md',
      'PLUGIN_DEVELOPMENT.md',
      'SECURITY.md'
    ]) {
      await write(root, `docs/${guide}`, `# ${guide}\n`);
    }
    await write(root, '.artifacts/v3/backup/README.md', '[Missing](nowhere.md)\n');

    const { checkDocumentation } = await import('../../scripts/lib/documentation.mjs');
    assert.deepEqual(await checkDocumentation(root), { ok: true, errors: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('public documentation and CI use the supported command interface', async () => {
  const { readFile } = await import('node:fs/promises');
  const [readme, docsIndex, gettingStarted, contributing, workflow, playwright] =
    await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('docs/README.md', 'utf8'),
    readFile('docs/GETTING_STARTED.md', 'utf8'),
    readFile('CONTRIBUTING.md', 'utf8'),
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('playwright.config.ts', 'utf8')
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
  for (const guide of [readme, gettingStarted]) {
    assert.ok(guide.indexOf('npm run setup') < guide.indexOf('npm start'));
    assert.doesNotMatch(guide, /cp apps\/api\/\.env\.example|Copy-Item apps\/api\/\.env\.example/i);
  }
  assert.match(contributing, /npm run setup -- --skip-build/);
  assert.match(contributing, /npm run dev/);

  const removedRunbooks = [['V3', 'CUTOVER'].join('_'), ['V3', 'ROLLBACK'].join('_')];
  assert.doesNotMatch(docsIndex, new RegExp(removedRunbooks.join('|')));
  assert.match(docsIndex, /GETTING_STARTED\.md/);
  assert.match(docsIndex, /CONFIGURATION\.md/);
  assert.match(docsIndex, /PLUGIN_DEVELOPMENT\.md/);
  assert.match(docsIndex, /SECURITY\.md/);
  assert.doesNotMatch(docsIndex, /ARCHITECTURE|SOURCE_READER|TERMUX|frontend\/|backend\//i);

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
});

test('NovelCool documentation publishes the external plugin installation boundary', async () => {
  const [readme, sourceReaderDocs] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('docs/PLUGIN_DEVELOPMENT.md', 'utf8')
  ]);

  assert.match(readme, /dist\/plugins\/novelcool-1\.0\.0\.source-plugin/);
  assert.match(sourceReaderDocs, /manual(?:ly)? install/i);
  assert.match(sourceReaderDocs, /local-unverified/i);
  assert.match(sourceReaderDocs, /isolated/i);
  assert.match(sourceReaderDocs, /no built-in fallback/i);
  assert.match(sourceReaderDocs, /latestVersion/);
  assert.match(sourceReaderDocs, /activeVersion/);
  assert.match(sourceReaderDocs, /Install\s*->\s*Approve\s*->\s*Enable/i);
  assert.match(sourceReaderDocs, /discovers? plugin workspaces without provider-specific code/i);
});

test('public documentation does not expose maintainer-only implementation material', async () => {
  const [readme, index] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('docs/README.md', 'utf8')
  ]);
  for (const content of [readme, index]) {
    assert.doesNotMatch(content, /\.internal\/|ARCHITECTURE\.md|FSD\.md|SHARED_THEME_CONTRACT|TERMUX/i);
  }
});

test('public docs keep release history without publishing internal acceptance runbooks', async () => {
  const [index, changelog] = await Promise.all([
    readFile('docs/README.md', 'utf8'),
    readFile('CHANGELOG.md', 'utf8')
  ]);

  assert.doesNotMatch(index, /E2E_TEST_CHECKLIST|MOBILE_UX_ACCEPTANCE|PERFORMANCE_BASELINE/i);
  assert.equal((changelog.match(/^## 1\.0\.0 - 2026-07-29$/gm) ?? []).length, 1);
  assert.doesNotMatch(changelog, /^## [23]\./gm);
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
  assert.equal((changelog.match(/^## 1\.0\.0 - 2026-07-29$/gm) ?? []).length, 1);
  assert.ok(changelog.indexOf('## Unreleased') < changelog.indexOf('## 1.0.0'));
});
