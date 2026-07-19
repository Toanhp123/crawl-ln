import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const size = read('apps/web/src/shared/theme/size.css');
const spacing = read('apps/web/src/shared/theme/spacing.css');
const components = read('apps/web/src/shared/theme/component-tokens.css');
const card = read('apps/web/src/shared/ui/layout/Card.tsx');
const panel = read('apps/web/src/shared/ui/layout/Panel.tsx');
const section = read('apps/web/src/shared/ui/layout/Section.tsx');
const listRow = read('apps/web/src/shared/ui/data-display/ListRow.tsx');

test('density has explicit compact and comfortable layout/control contracts', () => {
  assert.doesNotMatch(size, /--density-space/);
  assert.match(size, /data-density='compact'[\s\S]*--touch-target:/);
  assert.match(size, /data-density='comfortable'[\s\S]*--touch-target:/);
  assert.match(spacing, /data-density='compact'[\s\S]*--section-gap:/);
  assert.match(spacing, /data-density='comfortable'[\s\S]*--section-gap:/);
  assert.match(components, /data-density='compact'[\s\S]*--density-card-padding:/);
  assert.match(components, /data-density='comfortable'[\s\S]*--density-card-padding:/);
  assert.match(components, /--panel-padding-sm:/);
  assert.match(components, /--section-content-gap:/);
});

test('shared layout primitives consume density-owned tokens', () => {
  assert.match(card, /--card-padding-sm/);
  assert.match(card, /--card-padding-lg/);
  assert.match(card, /--card-header-gap/);
  assert.match(panel, /--panel-padding-sm/);
  assert.match(panel, /--panel-padding-md/);
  assert.match(panel, /--panel-padding-lg/);
  assert.match(section, /--section-content-gap/);
  assert.match(section, /--section-header-gap/);
  assert.match(listRow, /--list-item-gap/);
  assert.match(listRow, /--list-item-padding-y/);
});
