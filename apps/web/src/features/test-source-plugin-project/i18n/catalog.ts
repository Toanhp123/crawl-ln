import type { Catalog } from '../../../shared/i18n';

export const testSourcePluginProjectCatalogs = {
  en: { 'testSourcePluginProject.action': 'Test sandbox' },
  vi: { 'testSourcePluginProject.action': 'Test sandbox' }
} as const satisfies Record<'en' | 'vi', Catalog>;
