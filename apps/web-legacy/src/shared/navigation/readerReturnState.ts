export type ReaderNavigationState = {
  fromApp?: boolean;
  backgroundScrollKey?: string;
};

export function readerNavigationState(backgroundScrollKey?: string): ReaderNavigationState {
  return {
    fromApp: true,
    ...(backgroundScrollKey ? { backgroundScrollKey } : {})
  };
}

export function cameFromApp(state: unknown): boolean {
  return Boolean(state && typeof state === 'object' && (state as ReaderNavigationState).fromApp);
}

export function readBackgroundScrollKey(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as ReaderNavigationState).backgroundScrollKey;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
