import type { Catalog } from '../../../shared/i18n';
export const installSourcePluginCatalogs = {
  en: {
    'installSourcePlugin.description': 'Install a Source Reader plugin package.',
    'installSourcePlugin.file': 'Plugin package',
    'installSourcePlugin.install': 'Install plugin',
    'installSourcePlugin.installed': 'Plugin installed',
    'installSourcePlugin.failed': 'Plugin installation failed',
    'installSourcePlugin.tooLarge': 'The package exceeds 20 MiB.'
  },
  vi: {
    'installSourcePlugin.description': 'Cài đặt gói plugin Source Reader.',
    'installSourcePlugin.file': 'Gói plugin',
    'installSourcePlugin.install': 'Cài plugin',
    'installSourcePlugin.installed': 'Đã cài plugin',
    'installSourcePlugin.failed': 'Cài plugin thất bại',
    'installSourcePlugin.tooLarge': 'Gói vượt quá 20 MiB.'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
