import type { Catalog } from '../../../shared/i18n';

export const sourceAuthChallengeCatalogs = {
  en: {
    'sources.challenges.expires': 'Expires {value}',
    'common.status.approval': 'Approval',
    'common.status.authenticated': 'Authenticated',
    'common.status.browser-interaction': 'Browser interaction',
    'common.status.captcha': 'CAPTCHA',
    'common.status.challenge-required': 'Challenge required',
    'common.status.expired': 'Expired',
    'common.status.otp': 'One-time code'
  },
  vi: {
    'sources.challenges.expires': 'Hết hạn {value}',
    'common.status.approval': 'Phê duyệt',
    'common.status.authenticated': 'Đã xác thực',
    'common.status.browser-interaction': 'Tương tác trình duyệt',
    'common.status.captcha': 'CAPTCHA',
    'common.status.challenge-required': 'Cần xử lý xác thực',
    'common.status.expired': 'Đã hết hạn',
    'common.status.otp': 'Mã dùng một lần'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
