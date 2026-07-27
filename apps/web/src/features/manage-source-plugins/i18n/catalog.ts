import type { Catalog } from '../../../shared/i18n';
export const manageSourcePluginsCatalogs = {
  en: {
    'manageSourcePlugins.toggle': 'Enable {name}',
    'manageSourcePlugins.approvalTitle': 'Permission approval required',
    'manageSourcePlugins.approvalRequired':
      'Approve permissions for the latest version before enabling this plugin.',
    'manageSourcePlugins.reviewPermissions': 'Review permissions',
    'manageSourcePlugins.usageConflictTitle': 'Plugin is in use',
    'manageSourcePlugins.disableUsageConflict':
      'This plugin is being used by {count} active crawl task(s). Pause or cancel those tasks before disabling it.',
    'manageSourcePlugins.removeUsageConflict':
      'This plugin is still required by {count} unfinished crawl task(s), including paused tasks. Complete or cancel those tasks before removing it.',
    'manageSourcePlugins.goToTasks': 'Go to activity',
    'manageSourcePlugins.enabled': 'Plugin enabled',
    'manageSourcePlugins.disabled': 'Plugin disabled',
    'manageSourcePlugins.activateLatest': 'Activate latest',
    'manageSourcePlugins.latestActivated': 'Latest version activated',
    'manageSourcePlugins.remove': 'Remove plugin',
    'manageSourcePlugins.removeTitle': 'Remove this plugin?',
    'manageSourcePlugins.removed': 'Plugin removed',
    'manageSourcePlugins.failed': 'Plugin update failed'
  },
  vi: {
    'manageSourcePlugins.toggle': 'Bật {name}',
    'manageSourcePlugins.approvalTitle': 'Cần phê duyệt quyền',
    'manageSourcePlugins.approvalRequired':
      'Hãy phê duyệt quyền cho phiên bản mới nhất trước khi bật plugin.',
    'manageSourcePlugins.reviewPermissions': 'Xem và phê duyệt quyền',
    'manageSourcePlugins.usageConflictTitle': 'Plugin đang được sử dụng',
    'manageSourcePlugins.disableUsageConflict':
      'Plugin đang được {count} tác vụ crawl hoạt động sử dụng. Hãy tạm dừng hoặc hủy các tác vụ trước khi tắt plugin.',
    'manageSourcePlugins.removeUsageConflict':
      'Plugin vẫn cần cho {count} tác vụ crawl chưa hoàn tất, bao gồm cả tác vụ đã tạm dừng. Hãy hoàn tất hoặc hủy các tác vụ trước khi gỡ plugin.',
    'manageSourcePlugins.goToTasks': 'Đến danh sách tác vụ',
    'manageSourcePlugins.enabled': 'Đã bật plugin',
    'manageSourcePlugins.disabled': 'Đã tắt plugin',
    'manageSourcePlugins.activateLatest': 'Kích hoạt bản mới nhất',
    'manageSourcePlugins.latestActivated': 'Đã kích hoạt phiên bản mới nhất',
    'manageSourcePlugins.remove': 'Gỡ plugin',
    'manageSourcePlugins.removeTitle': 'Gỡ plugin này?',
    'manageSourcePlugins.removed': 'Đã gỡ plugin',
    'manageSourcePlugins.failed': 'Cập nhật plugin thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
