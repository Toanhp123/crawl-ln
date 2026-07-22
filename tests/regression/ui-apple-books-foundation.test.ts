import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('Apple Books Compact typography is the canonical application scale', () => {
  const css = read('apps/web-legacy/src/shared/theme/typography.css');

  assert.match(css, /--type-display-size:\s*22px/);
  assert.match(css, /--type-display-line:\s*27px/);
  assert.match(css, /--type-headline-size:\s*18px/);
  assert.match(css, /--type-title-size:\s*15px/);
  assert.match(css, /--type-body-size:\s*14px/);
  assert.match(css, /--type-supporting-size:\s*12px/);
  assert.match(css, /--type-metadata-size:\s*11px/);
  assert.doesNotMatch(css, /data-app-font='medium'[\s\S]*--type-caption-size/);
});

test('foundation uses the approved spacing, radius, motion, and icon scales', () => {
  const spacing = read('apps/web-legacy/src/shared/theme/spacing.css');
  const radius = read('apps/web-legacy/src/shared/theme/radius.css');
  const motion = read('apps/web-legacy/src/shared/theme/motion.css');
  const size = read('apps/web-legacy/src/shared/theme/size.css');

  assert.match(spacing, /--space-10:\s*2\.5rem/);
  assert.doesNotMatch(spacing, /--space-5:/);
  assert.match(radius, /--radius-sm:\s*0\.75rem/);
  assert.match(radius, /--radius-md:\s*1rem/);
  assert.match(radius, /--radius-lg:\s*1\.25rem/);
  assert.match(radius, /--radius-xl:\s*1\.75rem/);
  assert.doesNotMatch(radius, /--radius-(?:2xs|xs|2xl):/);
  assert.match(motion, /--motion-fast:\s*120ms/);
  assert.match(motion, /--motion-normal:\s*180ms/);
  assert.match(motion, /--motion-slow:\s*240ms/);
  assert.match(size, /--icon-sm:\s*1\.25rem/);
  assert.match(size, /--icon-md:\s*1\.5rem/);
  assert.match(size, /--icon-lg:\s*2rem/);
});

test('typed design token map exposes the same semantic contract', () => {
  const source = read('apps/web-legacy/src/design/tokens.ts');

  for (const group of ['typography', 'spacing', 'radius', 'motion', 'icons', 'layout', 'colors']) {
    assert.match(source, new RegExp(`${group}:\\s*\\{`));
  }
  assert.match(source, /pageTitle:\s*'--type-headline-size'/);
  assert.match(source, /cardTitle:\s*'--type-title-sm-size'/);
  assert.match(source, /supporting:\s*'--type-supporting-size'/);
});
