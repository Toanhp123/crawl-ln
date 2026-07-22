import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('Apple Books Compact Phase 4 keeps visual density restrained', () => {
  const typography = read('apps/web-legacy/src/shared/theme/typography.css');
  const components = read('apps/web-legacy/src/shared/theme/component-tokens.css');
  const pageHeader = read('apps/web-legacy/src/shared/ui/layout/PageHeader.tsx');
  const emptyState = read('apps/web-legacy/src/shared/ui/feedback/EmptyState.tsx');
  const bottomTabs = read('apps/web-legacy/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx');
  const progressRing = read('apps/web-legacy/src/shared/ui/feedback/ProgressRing.tsx');

  assert.match(typography, /--type-headline-size:\s*18px/);
  assert.match(typography, /--type-title-sm-size:\s*14px/);
  assert.match(components, /--density-card-padding:\s*var\(--space-3\)/);
  assert.match(components, /--density-section-content-gap:\s*var\(--space-2\)/);
  assert.match(pageHeader, /variant="pageTitle"/);
  assert.match(emptyState, /min-h-28 p-3/);
  assert.doesNotMatch(emptyState, /min-h-40 p-6/);
  assert.doesNotMatch(bottomTabs, /size=\{22\}/);
  assert.match(progressRing, /size = 64/);
});
