import type { Catalog } from '../../../shared/i18n';

export const chapterCatalogs = {
  en: {
    'chapters.empty': 'No chapters yet',
    'chapters.emptyDescription': 'Analyze a URL first to load the chapter list.',
    'chapters.noContent': 'Chapter content is unavailable',
    'chapters.noContentDescription':
      'Start a crawl or wait for the task to finish downloading this chapter.',
    'chapters.search': 'Search chapters...',
    'chapters.goTo': 'Go to',
    'chapters.goToPlaceholder': 'Chapter #',
    'chapters.noMatches': 'No matching chapters',
    'chapters.noMatchesDescription': 'Try another chapter title or number.',
    'common.status.fetched': 'Fetched',
    'common.status.pending': 'Pending'
  },
  vi: {
    'chapters.empty': 'Chưa có chương',
    'chapters.emptyDescription': 'Phân tích URL trước để lấy danh sách chương.',
    'chapters.noContent': 'Chương chưa có nội dung',
    'chapters.noContentDescription': 'Hãy bắt đầu thu thập hoặc chờ tác vụ tải xong chương này.',
    'chapters.search': 'Tìm chương...',
    'chapters.goTo': 'Đi tới',
    'chapters.goToPlaceholder': 'Số chương',
    'chapters.noMatches': 'Không tìm thấy chương',
    'chapters.noMatchesDescription': 'Thử tên hoặc số chương khác.',
    'common.status.fetched': 'Đã tải',
    'common.status.pending': 'Đang chờ'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
