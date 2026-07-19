import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('semantic typography uses unambiguous Tailwind font-size utilities', () => {
  const typography = read('apps/web/src/shared/theme/typography.css');
  const text = read('apps/web/src/shared/ui/data-display/Text.tsx');

  for (const role of [
    'display',
    'headline',
    'title',
    'title-sm',
    'body',
    'body-sm',
    'label',
    'supporting',
    'metadata',
    'caption',
    'metric-sm',
    'metric-lg'
  ]) {
    assert.match(typography, new RegExp(`\\.type-${role}\\s*\\{`));
    assert.match(text, new RegExp(`type-${role}`));
  }

  const sourceFiles = [
    text,
    read('apps/web/src/shared/ui/actions/Button.tsx'),
    read('apps/web/src/shared/ui/data-display/Chip.tsx')
  ].join('\n');
  assert.doesNotMatch(sourceFiles, /\btext-type-/);
  assert.doesNotMatch(sourceFiles, /text-\[var\(--type-[^)]+-size\)\]/);
});
