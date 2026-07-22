import type { Catalog } from '@/shared/i18n';

export const appMessagesVi = {
  'app.subtitle': 'Thư viện truyện ưu tiên dữ liệu cục bộ',
  'app.localData': 'Thư viện của bạn được lưu trên thiết bị này.',
  'nav.library': 'Thư viện',
  'nav.activity': 'Hoạt động',
  'nav.sources': 'Nguồn',
  'nav.settings': 'Cài đặt',
  'common.skipToContent': 'Bỏ qua đến nội dung',
  'common.skipToReader': 'Bỏ qua đến trình đọc',
  'common.interfaceError': 'Giao diện đã dừng ngoài dự kiến',
  'common.reload': 'Tải lại ứng dụng',
  'common.requestFailed': 'Yêu cầu không thành công.',
  'library.importNovel': 'Thêm truyện',
  'maintenance.busy': 'Một thao tác bảo trì đang chạy.',
  'errors.notFound': 'Không tìm thấy mục được yêu cầu.',
  'errors.validation': 'Hãy kiểm tra thông tin đã nhập rồi thử lại.',
  'errors.forbidden': 'Bạn không được phép thực hiện thao tác này.',
  'errors.conflict': 'Yêu cầu xung đột với trạng thái hiện tại.',
  'errors.network': 'Không thể kết nối đến dịch vụ.',
  'errors.internal': 'Dịch vụ gặp lỗi nội bộ.'
} as const satisfies Catalog;
