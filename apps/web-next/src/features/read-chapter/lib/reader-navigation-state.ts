export interface ReaderNavigationState {
  readerReturnPath: string;
  backgroundScrollKey?: string;
}

export function createReaderNavigationState(
  returnPath: string,
  backgroundScrollKey?: string
): ReaderNavigationState {
  return {
    readerReturnPath: returnPath,
    ...(backgroundScrollKey ? { backgroundScrollKey } : {})
  };
}

export function readReaderReturnState(state: unknown): ReaderNavigationState | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = state as Partial<ReaderNavigationState>;
  if (
    typeof candidate.readerReturnPath !== 'string' ||
    !candidate.readerReturnPath.startsWith('/')
  ) {
    return null;
  }
  return {
    readerReturnPath: candidate.readerReturnPath,
    ...(typeof candidate.backgroundScrollKey === 'string' &&
    candidate.backgroundScrollKey.length > 0
      ? { backgroundScrollKey: candidate.backgroundScrollKey }
      : {})
  };
}
