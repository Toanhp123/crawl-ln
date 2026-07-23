import { useEffect } from 'react';

const keyPrefix = 'novel-tool-scroll:';

export function useScrollRestoration(routeKey: string) {
  useEffect(() => {
    const key = `${keyPrefix}${routeKey}`;
    const restore = () => {
      const value = sessionStorage.getItem(key);
      if (value) window.scrollTo({ top: Number(value), behavior: 'instant' as ScrollBehavior });
    };

    const save = () => sessionStorage.setItem(key, String(window.scrollY));

    requestAnimationFrame(restore);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [routeKey]);
}
