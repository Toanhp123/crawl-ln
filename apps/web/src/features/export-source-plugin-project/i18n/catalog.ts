import type { Catalog } from '../../../shared/i18n';

export const exportSourcePluginProjectCatalogs = {
  en: { 'exportSourcePluginProject.action': 'Export package' },
  vi: { 'exportSourcePluginProject.action': 'Xuat goi plugin' }
} as const satisfies Record<'en' | 'vi', Catalog>;
