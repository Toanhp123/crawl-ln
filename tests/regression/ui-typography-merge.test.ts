import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cn } from '../../apps/web/src/shared/lib/cn';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('semantic typography survives color class merging', () => {
  assert.equal(cn('type-supporting', 'text-secondary'), 'type-supporting text-secondary');
  assert.equal(cn('type-title-sm', 'text-text'), 'type-title-sm text-text');
});

test('semantic typography utilities own font size and line height', () => {
  const typography = read('apps/web/src/shared/theme/typography.css');
  const text = read('apps/web/src/shared/ui/data-display/Text.tsx');
  const webSource = read('apps/web/src/shared/ui/actions/Button.tsx') + text;

  assert.match(
    typography,
    /\.type-supporting\s*\{[^}]*font-size:\s*var\(--type-supporting-size\);[^}]*line-height:\s*var\(--type-supporting-line\);/s
  );
  assert.match(text, /supporting:\s*'type-supporting\s+font-normal/);
  assert.doesNotMatch(webSource, /\btext-type-/);
});
