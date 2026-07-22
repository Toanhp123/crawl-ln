export type Catalog = Readonly<Record<string, string>>;

export function mergeCatalogs(...catalogs: ReadonlyArray<Catalog>): Catalog {
  return Object.assign({}, ...catalogs);
}

export const genericCatalogs = {
  en: {
    'common.cancel': 'Cancel',
    'common.clearSearch': 'Clear search',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.details': 'Details',
    'common.error': 'Something went wrong',
    'common.errorDescription': 'Please try again.',
    'common.loadingData': 'Loading…',
    'common.mainNavigation': 'Main navigation',
    'common.next': 'Next',
    'common.notifications': 'Notifications',
    'common.previous': 'Previous',
    'common.requestFailed': 'The request failed.',
    'common.search': 'Search'
  },
  vi: {
    'common.cancel': 'Hủy',
    'common.clearSearch': 'Xóa tìm kiếm',
    'common.close': 'Đóng',
    'common.confirm': 'Xác nhận',
    'common.details': 'Chi tiết',
    'common.error': 'Đã xảy ra lỗi',
    'common.errorDescription': 'Vui lòng thử lại.',
    'common.loadingData': 'Đang tải…',
    'common.mainNavigation': 'Điều hướng chính',
    'common.next': 'Tiếp',
    'common.notifications': 'Thông báo',
    'common.previous': 'Trước',
    'common.requestFailed': 'Yêu cầu không thành công.',
    'common.search': 'Tìm kiếm'
  }
} as const satisfies Record<string, Catalog>;
