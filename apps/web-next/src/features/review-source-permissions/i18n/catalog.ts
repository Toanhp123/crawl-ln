import type { Catalog } from '../../../shared/i18n';
export const reviewSourcePermissionsCatalogs = {
  en: {
    'reviewSourcePermissions.empty': 'No permissions requested.',
    'reviewSourcePermissions.approve': 'Approve',
    'reviewSourcePermissions.deny': 'Deny',
    'reviewSourcePermissions.approved': 'Permissions approved',
    'reviewSourcePermissions.denied': 'Permissions denied',
    'reviewSourcePermissions.failed': 'Permission review failed'
  },
  vi: {
    'reviewSourcePermissions.empty': 'Không có quyền nào được yêu cầu.',
    'reviewSourcePermissions.approve': 'Cho phép',
    'reviewSourcePermissions.deny': 'Từ chối',
    'reviewSourcePermissions.approved': 'Đã cho phép quyền',
    'reviewSourcePermissions.denied': 'Đã từ chối quyền',
    'reviewSourcePermissions.failed': 'Duyệt quyền thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
