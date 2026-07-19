import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const webSourceRoot = join(root, 'apps/web/src');

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? collectTsxFiles(path)
      : entry.endsWith('.tsx')
        ? [path]
        : [];
  });
}

const forbiddenTypography = [
  /(?:^|\s)(?:[a-z-]+:)*text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(?=[\s'"`}]|$)/g,
  /(?:^|\s)(?:[a-z-]+:)*text-\[(?:\d+(?:\.\d+)?(?:px|rem|em)|var\(--(?:type-[^)]+-size|app-subtitle-size|bottom-nav-label-size)\))\](?=[\s'"`}]|$)/g,
  /(?:^|\s)(?:[a-z-]+:)*leading-(?:none|tight|snug|normal|relaxed|loose|\d+|\[[^\]]+\])(?=[\s'"`}]|$)/g
];

test('web TSX uses semantic typography roles for size and line height', () => {
  const violations: string[] = [];

  for (const file of collectTsxFiles(webSourceRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbiddenTypography) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${relative(root, file)}:${line}: ${match[0].trim()}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('Text variants delegate line height to semantic type classes', () => {
  const source = readFileSync(join(webSourceRoot, 'shared/ui/data-display/Text.tsx'), 'utf8');
  assert.doesNotMatch(source, /leading-\[var\(--type-/);
  assert.match(source, /supporting:\s*'type-supporting font-normal'/);
});
