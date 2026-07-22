import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('visual style guide keeps supporting copy visually subordinate', () => {
  const typography = read('apps/web-legacy/src/shared/theme/typography.css');
  assert.match(typography, /--type-supporting-size:\s*12px/);
  assert.match(typography, /--type-supporting-line:\s*15px/);
  assert.match(typography, /--type-metadata-size:\s*11px/);
  assert.match(typography, /--type-metadata-line:\s*13px/);
  assert.match(typography, /--type-title-sm-size:\s*14px/);
  assert.match(typography, /--type-title-sm-line:\s*18px/);
});

test('empty state composes title and description as separate block landmarks', () => {
  const emptyState = read('apps/web-legacy/src/shared/ui/feedback/EmptyState.tsx');
  assert.match(emptyState, /<Text\s+as="h2"\s+variant="cardTitle"/);
  assert.match(emptyState, /<Text\s+as="p"\s+variant="supporting"/);
  assert.match(emptyState, /max-w-\[28ch\]/);
  assert.match(emptyState, /mt-2/);
});

test('form inputs use body-small typography instead of browser-sized text', () => {
  const input = read('apps/web-legacy/src/shared/ui/forms/Input.tsx');
  assert.match(input, /type-body-sm/);
  assert.doesNotMatch(input, /leading-/);
  assert.doesNotMatch(input, /\btext-base\b/);
});

test('the visual style guide documents hierarchy and composition rules', () => {
  const guide = read('apps/web-legacy/src/shared/theme/VISUAL_STYLE_GUIDE.md');
  assert.match(guide, /Supporting copy.*12 \/ 15/s);
  assert.match(guide, /Metadata.*11 \/ 13/s);
  assert.match(guide, /Empty state/s);
  assert.match(guide, /Title and supporting copy must be separate block elements/s);
});
