import type { Catalog } from '../../../shared/i18n';

export const installSourcePluginProjectCatalogs = {
  en: { 'installSourcePluginProject.action': 'Install build' },
  vi: { 'installSourcePluginProject.action': 'Cai ban build' }
} as const satisfies Record<'en' | 'vi', Catalog>;
