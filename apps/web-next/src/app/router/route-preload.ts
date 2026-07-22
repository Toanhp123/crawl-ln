const foundationPage = () => import('@/pages/foundation');

export const routeLoaders = {
  library: foundationPage,
  novelDetail: foundationPage,
  reader: foundationPage,
  taskDetail: foundationPage,
  activity: foundationPage,
  sources: foundationPage,
  sourcePlugin: foundationPage,
  settings: foundationPage
} as const;

type TopLevelRoute = 'library' | 'activity' | 'sources' | 'settings';

const routeByPath: Record<TopLevelRoute, () => Promise<unknown>> = {
  library: routeLoaders.library,
  activity: routeLoaders.activity,
  sources: routeLoaders.sources,
  settings: routeLoaders.settings
};

function routeName(pathname: string): TopLevelRoute | undefined {
  if (pathname.startsWith('/library')) return 'library';
  if (pathname.startsWith('/activity')) return 'activity';
  if (pathname.startsWith('/sources')) return 'sources';
  if (pathname.startsWith('/settings')) return 'settings';
  return undefined;
}

export function preloadRoute(pathname: string): void {
  const name = routeName(pathname);
  if (name) void routeByPath[name]();
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function shouldAvoidIdlePrefetch(): boolean {
  if (typeof navigator === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return Boolean(
    connection?.saveData ||
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  );
}

export function scheduleIdleRoutePreload(currentPath: string): () => void {
  if (typeof window === 'undefined' || shouldAvoidIdlePrefetch()) return () => undefined;
  const idleWindow = window as unknown as {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const current = routeName(currentPath);
  const preload = () => {
    (Object.keys(routeByPath) as TopLevelRoute[])
      .filter((name) => name !== current)
      .forEach((name) => void routeByPath[name]());
  };
  if (
    typeof idleWindow.requestIdleCallback === 'function' &&
    typeof idleWindow.cancelIdleCallback === 'function'
  ) {
    const idleId = idleWindow.requestIdleCallback(preload, { timeout: 3000 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }
  const timeoutId = window.setTimeout(preload, 1500);
  return () => window.clearTimeout(timeoutId);
}
