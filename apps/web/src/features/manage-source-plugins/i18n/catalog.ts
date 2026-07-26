import type { Catalog } from '../../../shared/i18n';
export const manageSourcePluginsCatalogs = {
  en: {
    'manageSourcePlugins.toggle': 'Enable {name}',
    'manageSourcePlugins.approvalRequired':
      'Approve permissions for the latest version before enabling this plugin.',
    'manageSourcePlugins.enabled': 'Plugin enabled',
    'manageSourcePlugins.disabled': 'Plugin disabled',
    'manageSourcePlugins.remove': 'Remove plugin',
    'manageSourcePlugins.removeTitle': 'Remove this plugin?',
    'manageSourcePlugins.removed': 'Plugin removed',
    'manageSourcePlugins.failed': 'Plugin update failed'
  },
  vi: {
    'manageSourcePlugins.toggle': 'Bật {name}',
    'manageSourcePlugins.approvalRequired':
      'Hãy phê duyệt quyền cho phiên bản mới nhất trước khi bật plugin.',
    'manageSourcePlugins.enabled': 'Đã bật plugin',
    'manageSourcePlugins.disabled': 'Đã tắt plugin',
    'manageSourcePlugins.remove': 'Gỡ plugin',
    'manageSourcePlugins.removeTitle': 'Gỡ plugin này?',
    'manageSourcePlugins.removed': 'Đã gỡ plugin',
    'manageSourcePlugins.failed': 'Cập nhật plugin thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
