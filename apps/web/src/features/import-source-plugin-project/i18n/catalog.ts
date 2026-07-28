import type { Catalog } from '../../../shared/i18n';

export const importSourcePluginProjectCatalogs = {
  en: {
    'importSourcePluginProject.modeLabel': 'Project setup',
    'importSourcePluginProject.createBlank': 'Create blank',
    'importSourcePluginProject.importProject': 'Import project',
    'importSourcePluginProject.description':
      'Import validated source files into Plugin Studio without building or installing a plugin.',
    'importSourcePluginProject.file': 'Source archive',
    'importSourcePluginProject.choose': 'Choose archive',
    'importSourcePluginProject.drop': 'or drop it here',
    'importSourcePluginProject.empty': 'No file selected',
    'importSourcePluginProject.remove': 'Remove selected archive',
    'importSourcePluginProject.inspecting': 'Inspecting project archive',
    'importSourcePluginProject.inspectingDescription':
      'Checking archive safety and source layout before import.',
    'importSourcePluginProject.preview': 'Project archive preview',
    'importSourcePluginProject.kind': 'Archive kind',
    'importSourcePluginProject.kind.built-package': 'Built package',
    'importSourcePluginProject.kind.studio-source': 'Plugin Studio source',
    'importSourcePluginProject.kind.npm-workspace': 'npm workspace source',
    'importSourcePluginProject.name': 'Plugin',
    'importSourcePluginProject.version': 'Version',
    'importSourcePluginProject.hosts': 'Network hosts',
    'importSourcePluginProject.capabilities': 'Capabilities',
    'importSourcePluginProject.ignoredFiles': '{count} archive files will not be imported.',
    'importSourcePluginProject.builtPackageUnsupported':
      'Built packages cannot become Studio projects. Select a source archive instead.',
    'importSourcePluginProject.conflicts':
      '{count} existing Studio project(s) use this plugin ID. Choose how to continue.',
    'importSourcePluginProject.resolution': 'Duplicate project handling',
    'importSourcePluginProject.createCopy': 'Create a separate Studio project',
    'importSourcePluginProject.createCopyDescription':
      'Keep every existing project unchanged and import a new copy.',
    'importSourcePluginProject.update': 'Update {name}',
    'importSourcePluginProject.updateDescription':
      'Replace source files for version {version} at revision {revision}.',
    'importSourcePluginProject.noBuildInstall':
      'Import validates and saves source files only. It does not build or install the plugin.',
    'importSourcePluginProject.action': 'Import project',
    'importSourcePluginProject.imported': 'Studio project imported',
    'importSourcePluginProject.failed': 'Project import failed',
    'importSourcePluginProject.tooLarge': 'The archive exceeds 20 MiB.'
  },
  vi: {
    'importSourcePluginProject.modeLabel': 'Cach tao project',
    'importSourcePluginProject.createBlank': 'Tao project trong',
    'importSourcePluginProject.importProject': 'Import project',
    'importSourcePluginProject.description':
      'Import ma nguon da validate vao Plugin Studio ma khong build hay cai plugin.',
    'importSourcePluginProject.file': 'Tep nen ma nguon',
    'importSourcePluginProject.choose': 'Chon tep nen',
    'importSourcePluginProject.drop': 'hoac tha tep vao day',
    'importSourcePluginProject.empty': 'Chua chon tep',
    'importSourcePluginProject.remove': 'Xoa tep nen da chon',
    'importSourcePluginProject.inspecting': 'Dang kiem tra tep project',
    'importSourcePluginProject.inspectingDescription':
      'Kiem tra an toan va cau truc ma nguon truoc khi import.',
    'importSourcePluginProject.preview': 'Xem truoc project',
    'importSourcePluginProject.kind': 'Loai tep nen',
    'importSourcePluginProject.kind.built-package': 'Goi da build',
    'importSourcePluginProject.kind.studio-source': 'Ma nguon Plugin Studio',
    'importSourcePluginProject.kind.npm-workspace': 'Ma nguon npm workspace',
    'importSourcePluginProject.name': 'Plugin',
    'importSourcePluginProject.version': 'Phien ban',
    'importSourcePluginProject.hosts': 'Domain mang',
    'importSourcePluginProject.capabilities': 'Kha nang',
    'importSourcePluginProject.ignoredFiles': '{count} tep se khong duoc import.',
    'importSourcePluginProject.builtPackageUnsupported':
      'Goi da build khong the thanh project Studio. Hay chon tep ma nguon.',
    'importSourcePluginProject.conflicts':
      '{count} project Studio dang dung plugin ID nay. Hay chon cach tiep tuc.',
    'importSourcePluginProject.resolution': 'Xu ly project trung',
    'importSourcePluginProject.createCopy': 'Tao mot project Studio rieng',
    'importSourcePluginProject.createCopyDescription':
      'Giu nguyen moi project hien co va import thanh mot ban moi.',
    'importSourcePluginProject.update': 'Cap nhat {name}',
    'importSourcePluginProject.updateDescription':
      'Thay ma nguon cua phien ban {version} tai revision {revision}.',
    'importSourcePluginProject.noBuildInstall':
      'Import chi validate va luu ma nguon. Plugin khong bi build hay cai dat.',
    'importSourcePluginProject.action': 'Import project',
    'importSourcePluginProject.imported': 'Da import project Studio',
    'importSourcePluginProject.failed': 'Import project that bai',
    'importSourcePluginProject.tooLarge': 'Tep nen vuot qua 20 MiB.'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
