import { Suspense, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router-dom';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { LoadingState, ScrollViewport } from '@/shared/ui';

export function ReaderShell() {
  const { t } = useI18n();

  useLayoutEffect(() => {
    const appRoot = document.getElementById('app-shell-root');
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    appRoot?.setAttribute('inert', '');
    const focusFrame = window.requestAnimationFrame(() => {
      document.getElementById('reader-scroll-root')?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      appRoot?.removeAttribute('inert');
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[var(--z-overlay)] h-svh overflow-hidden bg-bg text-text"
    >
      <a
        href="#reader-shell-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-toast)] focus:rounded-[var(--radius-md)] focus:bg-primary focus:px-4 focus:py-3 focus:text-[hsl(var(--color-primary-contrast))]"
      >
        {t('common.skipToReader')}
      </a>
      <ScrollViewport id="reader-scroll-root" className="h-full">
        <div id="reader-shell-content">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </div>
      </ScrollViewport>
    </div>,
    document.body
  );
}
