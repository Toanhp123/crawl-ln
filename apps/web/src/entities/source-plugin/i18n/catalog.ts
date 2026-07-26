import type { Catalog } from '../../../shared/i18n';

export const sourcePluginCatalogs = {
  en: {
    'sources.plugins.version': 'Version {value}',
    'sources.plugins.latestVersion': 'Latest installed version',
    'sources.plugins.runningVersion': 'Running version',
    'common.status.api_mismatch': 'API mismatch',
    'common.status.blocked': 'Blocked',
    'common.status.built-in': 'Built in',
    'common.status.disabled': 'Disabled',
    'common.status.initializing': 'Initializing',
    'common.status.installed': 'Installed',
    'common.status.installed-pending-revalidation': 'Pending revalidation',
    'common.status.invalid': 'Invalid',
    'common.status.local-unverified': 'Local, unverified',
    'common.status.pending-approval': 'Pending approval',
    'common.status.quarantined': 'Quarantined',
    'common.status.signed': 'Signed',
    'common.status.unknown': 'Unknown'
  },
  vi: {
    'sources.plugins.version': 'Phiên bản {value}',
    'sources.plugins.latestVersion': 'Phiên bản mới nhất đã cài',
    'sources.plugins.runningVersion': 'Phiên bản đang chạy',
    'common.status.api_mismatch': 'Không tương thích API',
    'common.status.blocked': 'Đã chặn',
    'common.status.built-in': 'Tích hợp sẵn',
    'common.status.disabled': 'Đã tắt',
    'common.status.initializing': 'Đang khởi tạo',
    'common.status.installed': 'Đã cài',
    'common.status.installed-pending-revalidation': 'Chờ xác minh lại',
    'common.status.invalid': 'Không hợp lệ',
    'common.status.local-unverified': 'Cục bộ, chưa xác minh',
    'common.status.pending-approval': 'Chờ phê duyệt',
    'common.status.quarantined': 'Đã cách ly',
    'common.status.signed': 'Đã ký',
    'common.status.unknown': 'Chưa rõ'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
