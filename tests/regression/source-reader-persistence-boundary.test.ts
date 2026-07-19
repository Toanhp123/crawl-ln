import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('only source reader infrastructure queries source_reader tables', () => {
  for (const file of files('apps/api/src')) {
    const source = readFileSync(file, 'utf8');
    if (!/source_reader_/.test(source)) continue;
    assert.match(
      file.replaceAll('\\', '/'),
      /modules\/source-reader\/infrastructure\/(?:sqlite|cache)\/|shared\/database\/sqlite\.ts$/,
      file
    );
  }
});
