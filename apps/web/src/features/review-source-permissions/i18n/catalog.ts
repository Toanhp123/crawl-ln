import type { Catalog } from '../../../shared/i18n';
export const reviewSourcePermissionsCatalogs = {
  en: {
    'reviewSourcePermissions.empty': 'No permissions requested.',
    'reviewSourcePermissions.approve': 'Approve',
    'reviewSourcePermissions.deny': 'Deny',
    'reviewSourcePermissions.approved': 'Permissions approved',
    'reviewSourcePermissions.denied': 'Permissions denied',
    'reviewSourcePermissions.denyUsageConflictTitle': 'Plugin is in use',
    'reviewSourcePermissions.denyUsageConflict':
      'This plugin is still required by {count} unfinished crawl task(s), including paused tasks. Complete or cancel those tasks before denying its permissions.',
    'reviewSourcePermissions.goToTasks': 'Go to activity',
    'reviewSourcePermissions.failed': 'Permission review failed'
  },
  vi: {
    'reviewSourcePermissions.empty': 'Không có quyền nào được yêu cầu.',
    'reviewSourcePermissions.approve': 'Cho phép',
    'reviewSourcePermissions.deny': 'Từ chối',
    'reviewSourcePermissions.approved': 'Đã cho phép quyền',
    'reviewSourcePermissions.denied': 'Đã từ chối quyền',
    'reviewSourcePermissions.denyUsageConflictTitle': 'Plugin đang được sử dụng',
    'reviewSourcePermissions.denyUsageConflict':
      'Plugin vẫn cần cho {count} tác vụ crawl chưa hoàn tất, bao gồm cả tác vụ đã tạm dừng. Hãy hoàn tất hoặc hủy các tác vụ trước khi từ chối quyền.',
    'reviewSourcePermissions.goToTasks': 'Đến danh sách tác vụ',
    'reviewSourcePermissions.failed': 'Duyệt quyền thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
