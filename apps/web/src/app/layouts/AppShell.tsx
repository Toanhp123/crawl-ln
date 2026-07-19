import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { AppBottomTabs } from '@/widgets/bottom-tabs/ui/AppBottomTabs';
import { AppHeader } from '@/widgets/app-header/ui/AppHeader';
import { AppViewport, LoadingState } from '@/shared/ui';
import { AppScrollViewport } from './AppScrollViewport';
import { AppSidebar } from './AppSidebar';
import { preloadRoute, scheduleIdleRoutePreload } from '@/app/router/routePreload';
import { GlobalAddNovelProvider, useGlobalAddNovel } from '@/shared/model/GlobalAddNovelContext';
import { GlobalAddNovelOverlay } from './GlobalAddNovelOverlay';

function RouteLoading() {
  return (
    <div className="page-shell" role="status" aria-live="polite">
      <LoadingState />
    </div>
  );
}

function AppShellContent() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const addNovel = useGlobalAddNovel();
  useEffect(() => scheduleIdleRoutePreload(pathname), [pathname]);
  return (
    <div id="app-shell-root" className="h-full">
      <AppViewport>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-toast)] focus:rounded-[var(--radius-md)] focus:bg-primary focus:px-4 focus:py-3 focus:text-[hsl(var(--color-primary-contrast))]"
        >
          {t('common.skipToContent')}
        </a>
        <div className="flex h-full min-h-0">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="md:hidden">
              <AppHeader />
            </div>
            <AppScrollViewport>
              <div id="main-content" className="mx-auto w-full max-w-7xl">
                <Suspense fallback={<RouteLoading />}>
                  <Outlet />
                </Suspense>
              </div>
            </AppScrollViewport>
            <AppBottomTabs onRouteIntent={preloadRoute} onAddNovel={addNovel.open} />
          </div>
        </div>
        <GlobalAddNovelOverlay />
      </AppViewport>
    </div>
  );
}

export function AppShell() {
  return (
    <GlobalAddNovelProvider>
      <AppShellContent />
    </GlobalAddNovelProvider>
  );
}
