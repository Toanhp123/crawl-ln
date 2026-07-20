import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

test('Source Reader console has entity, feature and widget slices', async () => {
  for (const slice of [
    'source-plugin',
    'source-credential',
    'source-network-profile',
    'source-auth-challenge',
    'source-reader-result'
  ])
    assert.equal(await exists(`apps/web/src/entities/${slice}/index.ts`), true, slice);

  for (const slice of [
    'install-source-plugin',
    'manage-source-plugins',
    'review-source-permissions',
    'test-source-plugin',
    'manage-source-credential',
    'authenticate-source-credential',
    'manage-source-network-profile',
    'resolve-source-auth-challenge',
    'inspect-source-url'
  ])
    assert.equal(await exists(`apps/web/src/features/${slice}/index.ts`), true, slice);

  for (const slice of [
    'source-reader-overview',
    'source-plugin-details',
    'source-credentials-panel',
    'source-network-profiles-panel',
    'source-auth-challenges-panel',
    'source-inspector'
  ])
    assert.equal(await exists(`apps/web/src/widgets/${slice}/index.ts`), true, slice);
});

test('entity slices do not import upward FSD layers', async () => {
  for (const file of await walk('apps/web/src/entities')) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /@\/(features|widgets|pages|app)\//, file);
  }
});
