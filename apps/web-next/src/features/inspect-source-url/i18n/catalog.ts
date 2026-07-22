import type { Catalog } from '../../../shared/i18n';
export const inspectSourceUrlCatalogs = {
  en: {
    'inspectSourceUrl.operation': 'Operation',
    'inspectSourceUrl.url': 'Source URL',
    'inspectSourceUrl.query': 'Search query',
    'inspectSourceUrl.cursor': 'Cursor',
    'inspectSourceUrl.limit': 'Limit',
    'inspectSourceUrl.credential': 'Credential profile',
    'inspectSourceUrl.network': 'Network profile',
    'inspectSourceUrl.none': 'None',
    'inspectSourceUrl.fresh': 'Bypass cache',
    'inspectSourceUrl.timeout': 'Timeout (ms)',
    'inspectSourceUrl.run': 'Run operation',
    'inspectSourceUrl.raw': 'Raw redacted response',
    'inspectSourceUrl.next': 'Load next page',
    'inspectSourceUrl.empty': 'Run an operation to inspect source data.'
  },
  vi: {
    'inspectSourceUrl.operation': 'Thao tác',
    'inspectSourceUrl.url': 'URL nguồn',
    'inspectSourceUrl.query': 'Từ khóa tìm kiếm',
    'inspectSourceUrl.cursor': 'Cursor',
    'inspectSourceUrl.limit': 'Giới hạn',
    'inspectSourceUrl.credential': 'Hồ sơ đăng nhập',
    'inspectSourceUrl.network': 'Hồ sơ mạng',
    'inspectSourceUrl.none': 'Không dùng',
    'inspectSourceUrl.fresh': 'Bỏ qua cache',
    'inspectSourceUrl.timeout': 'Thời gian chờ (ms)',
    'inspectSourceUrl.run': 'Chạy thao tác',
    'inspectSourceUrl.raw': 'Phản hồi thô đã che dữ liệu nhạy cảm',
    'inspectSourceUrl.next': 'Tải trang tiếp',
    'inspectSourceUrl.empty': 'Chạy một thao tác để kiểm tra dữ liệu nguồn.'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
