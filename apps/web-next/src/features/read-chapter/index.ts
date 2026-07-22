export { readChapterCatalogs } from './i18n/catalog';
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
  readLegacyLatestReadingPosition,
  readReadingPosition,
  saveReadingPosition,
  type ChapterPositionIdentity,
  type StoredReadingPosition,
  type StoredReadingPositionV1,
  type StoredReadingPositionV2,
  type StoredReadingPositionV3
} from './lib/reading-position-storage';
export {
  useReaderController,
  type ReaderChapterSummary,
  type ReaderControllerOptions
} from './model/use-reader-controller';
export { useReaderProgress } from './model/use-reader-progress';
export {
  useSwipeChapterNavigation,
  type SwipeChapterNavigationOptions
} from './model/use-swipe-chapter-navigation';
export { ReaderOfflineBanner } from './ui/ReaderOfflineBanner';
