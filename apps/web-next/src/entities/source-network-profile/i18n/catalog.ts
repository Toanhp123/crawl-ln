import type { Catalog } from '../../../shared/i18n';

export const sourceNetworkProfileCatalogs = {
  en: {
    'sources.common.system': 'System',
    'sources.common.user': 'User'
  },
  vi: {
    'sources.common.system': 'Hệ thống',
    'sources.common.user': 'Người dùng'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
