import type { Catalog } from '../../../shared/i18n';

export const novelCatalogs = {
  en: {
    'common.status.active': 'Active',
    'common.status.analyzed': 'Analyzed',
    'common.status.crawling': 'Crawling'
  },
  vi: {
    'common.status.active': 'Hoạt động',
    'common.status.analyzed': 'Đã phân tích',
    'common.status.crawling': 'Đang thu thập'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
