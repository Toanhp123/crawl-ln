import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AddNovelOverlay, AddNovelProvider, useAddNovelOverlay } from '@/features/add-novel';
import { useI18n } from '@/shared/i18n';
import { AppViewport, LoadingState } from '@/shared/ui';
import { AppBottomTabs } from '@/widgets/bottom-tabs';
import { AppHeader } from '@/widgets/app-header';
import { preloadRoute, scheduleIdleRoutePreload } from '../router/route-preload';
import { AppScrollViewport } from './AppScrollViewport';
import { AppSidebar } from './AppSidebar';

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
  const addNovel = useAddNovelOverlay();

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
              <AppHeader onRouteIntent={preloadRoute} />
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
        <AddNovelOverlay />
      </AppViewport>
    </div>
  );
}

export function AppShell() {
  return (
    <AddNovelProvider>
      <AppShellContent />
    </AddNovelProvider>
  );
}
