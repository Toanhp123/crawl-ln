export { readChapterCatalogs } from './i18n/catalog';
export {
  createReaderNavigationState,
  readReaderReturnState,
  type ReaderNavigationState
} from './lib/reader-navigation-state';
export {
  createChapterLoaderAdapter,
  chapterLoaderAdapter,
  type ChapterReadPort
} from './lib/chapter-loader-adapter';
export { IndexedDbReaderChapterCache } from './lib/indexeddb-reader-cache';
export {
  captureReadingAnchor,
  paragraphDomId,
  READER_PARAGRAPH_SELECTOR,
  restoreReadingAnchor,
  type ReadingAnchorSnapshot
} from './lib/reading-anchor';
export {
  isBookmarked,
  listBookmarks,
  listReadingHistory,
  markChapterRead,
  readChapterIds,
  recordReadingActivity,
  removeBookmark,
  toggleBookmark,
  useReadingContinuityVersion,
  type ParagraphBookmark,
  type ReadingHistoryEntry
} from './lib/reading-continuity-storage';
export {
  readLatestReadingPosition,
  readReadingPosition,
  saveReadingPosition,
  type ChapterPositionIdentity,
  type StoredReadingPosition
} from './lib/reading-position-storage';
export {
  useReaderController,
  type ReaderChapterSummary,
  type ReaderControllerOptions
} from './model/use-reader-controller';
export { useReaderProgress } from './model/use-reader-progress';
export {
  isReaderUrlOnlySync,
  isReaderUrlUpdatePending,
  type ReaderRouteSyncSnapshot
} from './lib/reader-route-sync';
export {
  useSwipeChapterNavigation,
  type SwipeChapterNavigationOptions
} from './model/use-swipe-chapter-navigation';
export { ReaderOfflineBanner } from './ui/ReaderOfflineBanner';
