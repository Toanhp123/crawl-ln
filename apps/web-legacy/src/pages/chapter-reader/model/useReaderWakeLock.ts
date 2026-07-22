import { useEffect } from 'react';

type WakeLockSentinel = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
};

export function useReaderWakeLock(enabled: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!enabled || !wakeLock) return;

    let disposed = false;
    let lock: WakeLockSentinel | undefined;

    const release = async () => {
      const current = lock;
      lock = undefined;
      if (current) await current.release().catch(() => undefined);
    };

    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible' || lock) return;
      try {
        const acquired = await wakeLock.request('screen');
        if (disposed || document.visibilityState !== 'visible') {
          await acquired.release().catch(() => undefined);
          return;
        }
        lock = acquired;
      } catch {
        // Wake lock is best effort.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire();
      else void release();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void acquire();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void release();
    };
  }, [enabled]);
}
