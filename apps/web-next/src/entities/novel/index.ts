export { getNovel, getNovelStats, listNovels, type ListNovelsOptions } from './api/novel-api';
export { novelInvalidation, type NovelInvalidationApi } from './api/novel-invalidation';
export { novelKeys } from './api/novel-keys';
export { useNovel, useNovels, useNovelStats, type NovelQueryOptions } from './api/novel-queries';
export type { Novel, NovelDetail, NovelStats, PaginatedNovels } from './model/types';
export { NovelCover } from './ui/NovelCover';
export { NovelLibraryCard, type NovelReadingProgress } from './ui/NovelLibraryCard';
