import type { Catalog } from '../../../shared/i18n';

export const sourceCredentialCatalogs = {
  en: {
    'sources.common.system': 'System',
    'sources.common.user': 'User',
    'common.status.basic-auth': 'Basic authentication',
    'common.status.bearer-token': 'Bearer token',
    'common.status.cookie-import': 'Cookie import',
    'common.status.custom': 'Custom',
    'common.status.form-login': 'Form login'
  },
  vi: {
    'sources.common.system': 'Hệ thống',
    'sources.common.user': 'Người dùng',
    'common.status.basic-auth': 'Xác thực cơ bản',
    'common.status.bearer-token': 'Bearer token',
    'common.status.cookie-import': 'Nhập cookie',
    'common.status.custom': 'Tùy chỉnh',
    'common.status.form-login': 'Đăng nhập biểu mẫu'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
