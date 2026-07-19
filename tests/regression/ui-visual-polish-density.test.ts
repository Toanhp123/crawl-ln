import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('typography exposes compact description and metadata roles', () => {
  const typography = read('apps/web/src/shared/theme/typography.css');
  const text = read('apps/web/src/shared/ui/data-display/Text.tsx');
  assert.match(typography, /--type-supporting-size:\s*12px/);
  assert.match(typography, /--type-supporting-line:\s*15px/);
  assert.match(typography, /--type-metadata-size:\s*11px/);
  assert.match(typography, /--type-metadata-line:\s*13px/);
  assert.match(text, /supporting:/);
  assert.match(text, /metadata:/);
});

test('global add and shared descriptions use compact semantic roles', () => {
  const addOverlay = read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx');
  const empty = read('apps/web/src/shared/ui/feedback/EmptyState.tsx');
  const header = read('apps/web/src/shared/ui/layout/PageHeader.tsx');
  assert.match(addOverlay, /variant="supporting"/);
  assert.match(empty, /variant="supporting"/);
  assert.match(header, /variant="supporting"/);
});

test('visual rhythm uses compact description gaps without shrinking touch targets', () => {
  const tokens = read('apps/web/src/shared/theme/component-tokens.css');
  assert.match(tokens, /--description-title-gap:/);
  assert.match(tokens, /--description-content-gap:/);
  assert.match(tokens, /--control-min:\s*2\.75rem/);
});
