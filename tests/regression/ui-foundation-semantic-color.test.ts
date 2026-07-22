import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const colors = read('apps/web-legacy/src/shared/theme/colors.css');
const componentTokens = read('apps/web-legacy/src/shared/theme/component-tokens.css');
const collectSource = (directory: string): string[] =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) return collectSource(relative);
    if (relative === 'apps/web-legacy/src/shared/theme/colors.css') return [];
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [read(relative)] : [];
  });
const sourceFiles = collectSource('apps/web-legacy/src').join('\n');

test('semantic state colors are owned by the color foundation', () => {
  for (const token of [
    '--state-primary-subtle',
    '--state-primary-hover',
    '--state-primary-pressed',
    '--state-primary-selected',
    '--state-primary-border',
    '--state-success-subtle',
    '--state-success-border',
    '--state-warning-subtle',
    '--state-warning-border',
    '--state-danger-subtle',
    '--state-danger-hover',
    '--state-danger-border',
    '--state-info-subtle',
    '--state-info-border',
    '--state-focus-ring',
    '--state-selection'
  ]) {
    assert.match(colors, new RegExp(`${token}:`));
  }

  assert.doesNotMatch(componentTokens, /^\s*--state-(?:primary|success|warning|danger|info)-/m);
});

test('application UI does not mix semantic colors with arbitrary alpha utilities', () => {
  assert.doesNotMatch(
    sourceFiles,
    /(?:bg|border|text|ring)-(?:primary|success|warning|danger|info)\/\d+/
  );
  assert.doesNotMatch(
    sourceFiles,
    /hsl\(var\(--color-(?:primary|success|warning|danger|info)\)\s*\/\s*\.?\d+\)/
  );
});

test('semantic state tokens have distinct light and dark tuning', () => {
  assert.match(colors, /:root,\s*:root\[data-theme='dark'\][\s\S]*--state-primary-subtle:/);
  assert.match(colors, /:root\[data-theme='light'\][\s\S]*--state-primary-subtle:/);
});
