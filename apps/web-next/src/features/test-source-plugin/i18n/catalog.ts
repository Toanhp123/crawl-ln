import type { Catalog } from '../../../shared/i18n';
export const testSourcePluginCatalogs = {
  en: {
    'testSourcePlugin.test': 'Test plugin',
    'testSourcePlugin.completed': 'Plugin test completed',
    'testSourcePlugin.failed': 'Plugin test failed'
  },
  vi: {
    'testSourcePlugin.test': 'Kiểm tra plugin',
    'testSourcePlugin.completed': 'Đã kiểm tra plugin',
    'testSourcePlugin.failed': 'Kiểm tra plugin thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
