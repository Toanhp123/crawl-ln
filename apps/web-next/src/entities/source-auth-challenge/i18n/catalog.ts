import type { Catalog } from '../../../shared/i18n';

export const sourceAuthChallengeCatalogs = {
  en: {
    'sources.challenges.expires': 'Expires {value}'
  },
  vi: {
    'sources.challenges.expires': 'Hết hạn {value}'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
