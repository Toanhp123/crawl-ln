import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('query persistence uses IndexedDB with version and expiry', () => {
  const source = read('src/shared/api/queryPersistence.ts');
  assert.match(source, /indexedDB\.open/);
  assert.match(source, /CACHE_BUSTER/);
  assert.match(source, /MAX_CACHE_AGE/);
  assert.match(source, /dehydrate\(/);
  assert.match(source, /hydrate\(/);
});

test('only lightweight query roots are persisted', () => {
  const source = read('src/shared/api/queryPersistence.ts');
  assert.match(source, /novels.*list/s);
  assert.match(source, /tasks.*summary/s);
  assert.match(source, /scheduler.*status/s);
  assert.match(source, /plugins.*sources/s);
  assert.doesNotMatch(source, /chapters/);
  assert.doesNotMatch(source, /taskEvents/);
});

test('cache restores before React mounts and persistence starts after mount', () => {
  const source = read('src/main.tsx');
  assert.match(source, /await restoreQueryCache\(queryClient\)/);
  assert.match(source, /startQueryCachePersistence\(queryClient\)/);
});

test('route chunks share centralized loaders and support idle prefetch', () => {
  const router = read('src/app/router/AppRouter.tsx');
  const preload = read('src/app/router/routePreload.ts');
  assert.match(router, /routeLoaders/);
  assert.match(preload, /requestIdleCallback/);
  assert.match(preload, /saveData/);
  assert.match(preload, /effectiveType/);
});

test('navigation triggers route preload on user intent', () => {
  const bottomNav = read('src/shared/ui/navigation/BottomNav.tsx');
  const bottomTabs = read('src/widgets/bottom-tabs/ui/AppBottomTabs.tsx');
  const header = read('src/widgets/app-header/ui/AppHeader.tsx');
  assert.match(bottomNav, /onPointerEnter/);
  assert.match(bottomNav, /onFocus/);
  assert.match(bottomNav, /onTouchStart/);
  assert.match(bottomTabs, /onRouteIntent/);
  assert.match(header, /onRouteIntent/);
  const shell = read('src/app/layouts/AppShell.tsx');
  assert.match(shell, /onRouteIntent=\{preloadRoute\}/);
});
