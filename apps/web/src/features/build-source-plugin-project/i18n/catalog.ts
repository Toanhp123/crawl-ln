import type { Catalog } from '../../../shared/i18n';

export const buildSourcePluginProjectCatalogs = {
  en: { 'buildSourcePluginProject.action': 'Build' },
  vi: { 'buildSourcePluginProject.action': 'Build' }
} as const satisfies Record<'en' | 'vi', Catalog>;
