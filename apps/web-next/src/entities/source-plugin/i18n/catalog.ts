import type { Catalog } from '../../../shared/i18n';

export const sourcePluginCatalogs = {
  en: {
    'sources.plugins.version': 'Version {value}'
  },
  vi: {
    'sources.plugins.version': 'Phiên bản {value}'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
