import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

async function readTree(directory: string, root = directory): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target, root));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('web-next preserves the public route table and keeps mutations out of app', async () => {
  const router = await readFile('apps/web-next/src/app/router/AppRouter.tsx', 'utf8');
  for (const route of [
    '/library',
    '/library/:novelId',
    'read/:chapterIndex',
    '/activity',
    '/activity/:taskId',
    '/sources',
    '/sources/new',
    '/sources/:pluginId',
    '/settings'
  ]) {
    assert.match(router, new RegExp(escapeRegExp(route)));
  }
  assert.match(router, /lazy\(/);
  assert.match(router, /routeLoaders/);
  assert.doesNotMatch(router, /<Suspense\s+fallback=/);

  const app = await readTree('apps/web-next/src/app');
  assert.doesNotMatch(
    app,
    /useMutation|method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]PATCH|method:\s*['"]DELETE/
  );
});

test('app shell keeps navigation mounted and composes the global add-novel feature', async () => {
  const shell = await readFile('apps/web-next/src/app/layouts/AppShell.tsx', 'utf8');
  assert.match(shell, /<Suspense\s+fallback=\{<RouteLoading\s*\/>\}>/);
  assert.match(shell, /<Outlet\s*\/>/);
  assert.match(shell, /AddNovelProvider/);
  assert.match(shell, /<AddNovelOverlay\s*\/>/);
  assert.match(shell, /<AppSidebar\s*\/>/);
  assert.match(shell, /<AppHeader/);
  assert.match(shell, /<AppBottomTabs/);
  assert.match(shell, /scheduleIdleRoutePreload/);
  assert.match(shell, /href="#main-content"/);
  assert.doesNotMatch(shell, /useAddNovel\(|analyzeNovel|crawlNovel/);
});

test('provider composition preserves startup ownership and maintenance behavior', async () => {
  const providers = await readFile('apps/web-next/src/app/providers/AppProviders.tsx', 'utf8');
  const order = [
    'AppThemeProvider',
    'I18nProvider',
    'QueryClientProvider',
    'RealtimeProvider',
    'QueryProvider',
    'ErrorBoundaryProvider',
    'MaintenanceProvider',
    'ReaderPreferencesProvider',
    'BrowserRouter'
  ];
  let cursor = -1;
  for (const name of order) {
    const next = providers.indexOf(`<${name}`);
    assert.ok(next > cursor, `${name} must appear after the previous provider`);
    cursor = next;
  }

  const maintenance = await readFile(
    'apps/web-next/src/app/providers/MaintenanceProvider.tsx',
    'utf8'
  );
  assert.match(maintenance, /beforeunload/);
  assert.match(maintenance, /reloadOnSuccess/);
  assert.match(maintenance, /useMaintenanceOperation/);

  const errorBoundary = await readFile(
    'apps/web-next/src/app/providers/ErrorBoundaryProvider.tsx',
    'utf8'
  );
  assert.match(errorBoundary, /getDerivedStateFromError/);
  assert.match(errorBoundary, /window\.location\.reload/);
});

test('query provider injects the exact lightweight persistence policy', async () => {
  const queryProvider = await readFile('apps/web-next/src/app/providers/QueryProvider.tsx', 'utf8');
  for (const marker of [
    /root\s*===\s*['"]novels['"].*scope\s*===\s*['"]list['"]/s,
    /root\s*===\s*['"]tasks['"].*scope\s*===\s*['"]summary['"]/s,
    /root\s*===\s*['"]scheduler['"].*scope\s*===\s*['"]status['"]/s,
    /root\s*===\s*['"]source-reader['"].*scope\s*===\s*['"]plugins['"]/s
  ]) {
    assert.match(queryProvider, marker);
  }
  assert.doesNotMatch(queryProvider, /chapters|events/);
  assert.match(queryProvider, /ToastProvider/);
  const appProviders = await readFile('apps/web-next/src/app/providers/AppProviders.tsx', 'utf8');
  assert.match(appProviders, /RealtimeProvider/);
});

test('query cache restores before mount and persistence starts after mount', async () => {
  const main = await readFile('apps/web-next/src/main.tsx', 'utf8');
  const restoreIndex = main.indexOf('await restoreQueryCache');
  const renderIndex = main.indexOf('createRoot');
  const persistenceIndex = main.lastIndexOf('startQueryCachePersistence(');
  assert.ok(restoreIndex >= 0 && restoreIndex < renderIndex);
  assert.ok(persistenceIndex > renderIndex);
});

test('route preloading is centralized and respects constrained networks', async () => {
  const preload = await readFile('apps/web-next/src/app/router/route-preload.ts', 'utf8');
  assert.match(preload, /requestIdleCallback/);
  assert.match(preload, /saveData/);
  assert.match(preload, /effectiveType/);
  assert.match(preload, /preloadRoute/);
  assert.match(preload, /scheduleIdleRoutePreload/);

  const home = await readFile('apps/web-next/src/app/router/HomeRedirect.tsx', 'utf8');
  assert.match(home, /<Navigate\s+to="\/library"\s+replace\s*\/>/);
  assert.doesNotMatch(home, /useQuery|LoadingState/);
});

test('navigation widgets expose preload intent and persistent route chrome', async () => {
  const header = await readFile('apps/web-next/src/widgets/app-header/ui/AppHeader.tsx', 'utf8');
  const bottom = await readFile(
    'apps/web-next/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx',
    'utf8'
  );
  const sidebar = await readFile('apps/web-next/src/app/layouts/AppSidebar.tsx', 'utf8');
  assert.match(header, /onRouteIntent/);
  assert.match(bottom, /onRouteIntent/);
  assert.match(bottom, /onAddNovel/);
  assert.match(bottom, /useTaskSummary/);
  assert.match(sidebar, /preloadRoute/);
  assert.match(sidebar, /useTaskSummary/);
});

test('reader shell is nested, modal, focus-safe, and outside the app scroll viewport', async () => {
  const shell = await readFile('apps/web-next/src/app/layouts/ReaderShell.tsx', 'utf8');
  assert.match(shell, /createPortal/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /setAttribute\(['"]inert['"]/);
  assert.match(shell, /removeAttribute\(['"]inert['"]/);
  assert.match(shell, /reader-scroll-root/);
  assert.match(shell, /<Outlet\s*\/>/);

  const router = await readFile('apps/web-next/src/app/router/AppRouter.tsx', 'utf8');
  assert.match(router, /<Route\s+element=\{<ReaderShell\s*\/>\}>/);
});

test('app i18n merges shell and public slice catalogs with typed error translation', async () => {
  const catalog = await readFile('apps/web-next/src/app/i18n/catalog.ts', 'utf8');
  assert.match(catalog, /mergeCatalogs/);
  assert.match(catalog, /@\/features\/add-novel/);
  assert.match(catalog, /@\/features\/reader-preferences/);
  assert.match(catalog, /@\/entities\/source-plugin/);
  assert.match(catalog, /catalogFrom/);
  assert.match(catalog, /appMessagesEn/);
  assert.match(catalog, /appMessagesVi/);

  const errors = await readFile('apps/web-next/src/app/i18n/error-catalog.ts', 'utf8');
  assert.match(errors, /ApiError/);
  assert.match(errors, /NOT_FOUND/);
  assert.match(errors, /VALIDATION_ERROR/);
  assert.match(errors, /common\.requestFailed/);
});
