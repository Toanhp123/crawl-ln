export interface ReaderRouteSyncSnapshot {
  activeIndex: number;
  chapters: readonly { index: number }[];
}

export function isReaderUrlOnlySync(
  snapshot: ReaderRouteSyncSnapshot,
  requestedIndex: number
): boolean {
  return (
    snapshot.chapters.length > 0 &&
    snapshot.activeIndex === requestedIndex &&
    snapshot.chapters.some((chapter) => chapter.index === requestedIndex)
  );
}
