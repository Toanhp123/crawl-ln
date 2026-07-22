import type { Catalog } from '../../../shared/i18n';
export const resolveSourceAuthChallengeCatalogs = {
  en: {
    'resolveSourceAuthChallenge.otp': 'One-time code',
    'resolveSourceAuthChallenge.submit': 'Submit',
    'resolveSourceAuthChallenge.approve': 'Approve',
    'resolveSourceAuthChallenge.reject': 'Reject',
    'resolveSourceAuthChallenge.completed': 'Completed',
    'resolveSourceAuthChallenge.captcha': 'Complete the CAPTCHA in the trusted browser flow.',
    'resolveSourceAuthChallenge.cancel': 'Cancel challenge',
    'resolveSourceAuthChallenge.resolved': 'Challenge resolved',
    'resolveSourceAuthChallenge.cancelled': 'Challenge cancelled',
    'resolveSourceAuthChallenge.failed': 'Challenge action failed'
  },
  vi: {
    'resolveSourceAuthChallenge.otp': 'Mã dùng một lần',
    'resolveSourceAuthChallenge.submit': 'Gửi',
    'resolveSourceAuthChallenge.approve': 'Chấp thuận',
    'resolveSourceAuthChallenge.reject': 'Từ chối',
    'resolveSourceAuthChallenge.completed': 'Đã hoàn tất',
    'resolveSourceAuthChallenge.captcha': 'Hoàn tất CAPTCHA trong luồng trình duyệt tin cậy.',
    'resolveSourceAuthChallenge.cancel': 'Hủy thử thách',
    'resolveSourceAuthChallenge.resolved': 'Đã xử lý thử thách',
    'resolveSourceAuthChallenge.cancelled': 'Đã hủy thử thách',
    'resolveSourceAuthChallenge.failed': 'Xử lý thử thách thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
