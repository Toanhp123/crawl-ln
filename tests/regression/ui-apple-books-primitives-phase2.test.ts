import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const card = read('apps/web-legacy/src/shared/ui/layout/Card.tsx');
const chip = read('apps/web-legacy/src/shared/ui/data-display/Chip.tsx');
const badge = read('apps/web-legacy/src/shared/ui/feedback/Badge.tsx');
const filterChip = read('apps/web-legacy/src/shared/ui/forms/FilterChip.tsx');
const empty = read('apps/web-legacy/src/shared/ui/feedback/EmptyState.tsx');
const listRow = read('apps/web-legacy/src/shared/ui/data-display/ListRow.tsx');
const section = read('apps/web-legacy/src/shared/ui/layout/Section.tsx');
const toolbar = read('apps/web-legacy/src/shared/ui/layout/Toolbar.tsx');
const index = read('apps/web-legacy/src/shared/ui/index.ts');

test('Apple Books compact primitives expose one canonical composition API', () => {
  assert.match(card, /export function CardContent/);
  assert.match(card, /export function CardDescription/);
  assert.match(card, /export function CardFooter/);
  assert.match(chip, /export function Chip/);
  assert.match(toolbar, /export function Toolbar/);
  assert.match(index, /data-display\/Chip/);
  assert.match(index, /layout\/Toolbar/);
});

test('legacy badge and filter chip compose the canonical Chip primitive', () => {
  assert.match(badge, /<Chip/);
  assert.match(filterChip, /<Chip/);
  assert.doesNotMatch(badge, /const variants = cva/);
  assert.doesNotMatch(filterChip, /rounded-full border px-/);
});

test('empty state and list/section primitives use compact semantic typography', () => {
  assert.match(empty, /variant="supporting"/);
  assert.match(empty, /density\?: 'compact' \| 'regular'/);
  assert.match(listRow, /variant="cardTitle"/);
  assert.match(listRow, /variant="metadata"/);
  assert.match(section, /variant="sectionTitle"/);
  assert.match(section, /variant="supporting"/);
});
