import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bottomNav = readFileSync(
  new URL('../../apps/web-legacy/src/shared/ui/navigation/BottomNav.tsx', import.meta.url),
  'utf8'
);

const tailwindConfig = readFileSync(
  new URL('../../apps/web-legacy/tailwind.config.ts', import.meta.url),
  'utf8'
);
const addOverlay = readFileSync(
  new URL('../../apps/web-legacy/src/app/layouts/GlobalAddNovelOverlay.tsx', import.meta.url),
  'utf8'
);

test('mobile bottom navigation uses color-only active state without a selected background', () => {
  assert.match(bottomNav, /active \? 'text-primary'/);
  assert.doesNotMatch(bottomNav, /bg-primary-selected/);
  assert.doesNotMatch(bottomNav, /absolute bottom-0 h-1 w-6/);
});

test('single-digit bottom navigation badges stay circular', () => {
  assert.match(bottomNav, /item\.badge > 99 \? '99\+' : item\.badge/);
  assert.match(bottomNav, /inline-flex h-5[^"']*items-center justify-center rounded-full/);
});

test('global add action stays circular and the sheet uses compact supporting copy', () => {
  assert.match(bottomNav, /h-12 w-12 min-w-12 shrink-0 aspect-square rounded-full/);
  assert.match(bottomNav, /item\.kind !== 'action'/);
  assert.match(addOverlay, /variant="supporting"/);
  assert.doesNotMatch(addOverlay, /ImportProgressCard|ImportTimeline/);
});

test('touch devices do not keep Tailwind hover states after tapping controls', () => {
  assert.match(tailwindConfig, /future:\s*\{[\s\S]*hoverOnlyWhenSupported:\s*true/);
});

test('global add action uses the original simple floating button without a navigation cradle', () => {
  assert.match(bottomNav, /relative z-10 grid h-12 w-12/);
  assert.doesNotMatch(bottomNav, /before:h-\[4\.25rem\]|before:w-\[4\.25rem\]|before:rounded-full/);
  assert.doesNotMatch(bottomNav, /h-16 w-16|min-w-16/);
});
