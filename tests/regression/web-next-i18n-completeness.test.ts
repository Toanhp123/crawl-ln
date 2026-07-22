import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    })
  );
  return nested.flat();
}

function literalKeys(source: string, pattern: RegExp): Set<string> {
  const keys = new Set<string>();
  for (const match of source.matchAll(pattern)) keys.add(match[1]);
  return keys;
}

test('web-next has complete EN/VI literal catalogs without reflective feature loading', async () => {
  const files = (await sourceFiles('apps/web-next/src')).filter((file) => /\.(ts|tsx)$/.test(file));
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const catalogContents = contents.filter((_, index) => {
    const file = files[index];
    return file.endsWith('catalog.ts') || /app-messages\.[a-z]+\.ts$/.test(file);
  });
  const catalogKeys = new Set(
    catalogContents.flatMap((source) => [...literalKeys(source, /['"]([^'"]+)['"]\s*:/g)])
  );
  const usedKeys = new Set(
    contents.flatMap((source) => [...literalKeys(source, /\bt\(\s*['"]([^'"]+)['"]/g)])
  );
  const missing = [...usedKeys].filter((key) => !catalogKeys.has(key)).sort();
  assert.deepEqual(missing, []);

  const appCatalog = await readFile('apps/web-next/src/app/i18n/catalog.ts', 'utf8');
  assert.doesNotMatch(appCatalog, /import \* as/);
  assert.doesNotMatch(appCatalog, /Object\.entries/);
  assert.match(appCatalog, /import \{ chapterCatalogs \} from ['"]@\/entities\/chapter['"]/);
  assert.match(appCatalog, /import \{ novelCatalogs \} from ['"]@\/entities\/novel['"]/);
  assert.match(appCatalog, /import \{ taskCatalogs \} from ['"]@\/entities\/task['"]/);
});

test('web-next carries every current common status translation', async () => {
  const currentSources = await Promise.all(
    ['apps/web/src/shared/i18n/locales/en.ts', 'apps/web/src/shared/i18n/locales/vi.ts'].map(
      (file) => readFile(file, 'utf8')
    )
  );
  const nextFiles = (await sourceFiles('apps/web-next/src')).filter(
    (file) => file.endsWith('catalog.ts') || /app-messages\.[a-z]+\.ts$/.test(file)
  );
  const nextSources = await Promise.all(nextFiles.map((file) => readFile(file, 'utf8')));
  const current = new Set(
    currentSources.flatMap((source) => [
      ...literalKeys(source, /['"](common\.status\.[^'"]+)['"]\s*:/g)
    ])
  );
  const next = new Set(
    nextSources.flatMap((source) => [
      ...literalKeys(source, /['"](common\.status\.[^'"]+)['"]\s*:/g)
    ])
  );
  assert.deepEqual([...current].filter((key) => !next.has(key)).sort(), []);
});

test('web-next treats only entity and feature source modules as side-effect-free', async () => {
  const configModule = (await import('../../apps/web-next/vite.config')) as Record<string, unknown>;
  const moduleSideEffects = configModule.webNextModuleSideEffects;

  assert.equal(typeof moduleSideEffects, 'function');
  if (typeof moduleSideEffects !== 'function') return;

  const policy = moduleSideEffects as (id: string) => boolean | undefined;
  const sourceRoot = resolve('apps/web-next/src');
  assert.equal(policy(join(sourceRoot, 'entities/novel/index.ts')), false);
  assert.equal(policy(join(sourceRoot, 'features/read-chapter/index.ts')), false);
  assert.equal(policy(join(sourceRoot, 'app/i18n/catalog.ts')), undefined);
  assert.equal(policy(join(sourceRoot, 'features/read-chapter/reader.css')), undefined);
  assert.equal(policy('C:/repo/node_modules/example/src/features/index.ts'), undefined);
});
