import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('routes are lazy loaded behind Suspense', () => {
  const router = read('apps/web/src/app/router/AppRouter.tsx');
  const shell = read('apps/web/src/app/layouts/AppShell.tsx');
  assert.match(router, /lazy\(/);
  assert.doesNotMatch(router, /<Suspense\s+fallback=/);
  assert.match(shell, /<Suspense\s+fallback=\{<RouteLoading\s*\/>\}>/);
  assert.match(shell, /<Outlet\s*\/>/);
});

test('progress exposes accessible progressbar semantics', () => {
  const source = read('apps/web/src/shared/ui/feedback/Progress.tsx');
  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-valuenow/);
  assert.match(source, /aria-valuemin/);
  assert.match(source, /aria-valuemax/);
});

test('segmented controls support arrow keyboard navigation', () => {
  const source = read('apps/web/src/shared/ui/forms/SegmentedControl.tsx');
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /tabIndex/);
});

test('reduced motion policy has a single source of truth', () => {
  const appCss = read('apps/web/src/app/styles/index.css');
  const motionCss = read('apps/web/src/shared/theme/motion.css');
  assert.doesNotMatch(appCss, /prefers-reduced-motion/);
  assert.match(motionCss, /prefers-reduced-motion/);
});

test('reader shell provides a focusable main landmark', () => {
  const shell = read('apps/web/src/app/layouts/ReaderShell.tsx');
  const viewport = read('apps/web/src/shared/ui/layout/ScrollViewport.tsx');
  assert.match(shell, /<ScrollViewport/);
  assert.match(shell, /id="reader-scroll-root"/);
  assert.match(viewport, /<main/);
  assert.match(viewport, /tabIndex=\{-1\}/);
});
