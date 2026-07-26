import type { Catalog } from '../../../shared/i18n';

export const manageSourcePluginProjectCatalogs = {
  en: {
    'pluginStudio.eyebrow': 'Source development',
    'pluginStudio.title': 'Plugin Studio',
    'pluginStudio.description':
      'Generate, edit, verify and install isolated Source Reader plugins.',
    'pluginStudio.create': 'Create workspace',
    'pluginStudio.build': 'Build',
    'pluginStudio.test': 'Test sandbox',
    'pluginStudio.install': 'Install build',
    'pluginStudio.export': 'Export package',
    'pluginStudio.saved': 'Draft saved',
    'pluginStudio.saving': 'Saving draft...',
    'pluginStudio.ready': 'Workspace ready',
    'pluginStudio.importExisting': 'Install an existing package'
  },
  vi: {
    'pluginStudio.eyebrow': 'Phat trien nguon',
    'pluginStudio.title': 'Plugin Studio',
    'pluginStudio.description':
      'Sinh, sua, kiem tra va cai dat Source Reader plugin trong sandbox.',
    'pluginStudio.create': 'Tao workspace',
    'pluginStudio.build': 'Build',
    'pluginStudio.test': 'Test sandbox',
    'pluginStudio.install': 'Cai ban build',
    'pluginStudio.export': 'Xuat goi plugin',
    'pluginStudio.saved': 'Da luu draft',
    'pluginStudio.saving': 'Dang luu draft...',
    'pluginStudio.ready': 'Workspace san sang',
    'pluginStudio.importExisting': 'Cai dat goi plugin co san'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
