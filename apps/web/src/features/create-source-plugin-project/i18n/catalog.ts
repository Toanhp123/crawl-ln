import type { Catalog } from '../../../shared/i18n';

export const createSourcePluginProjectCatalogs = {
  en: {
    'createSourcePluginProject.title': 'Scaffold a clean SDK plugin',
    'createSourcePluginProject.description':
      'No package install, no ambient Node access, isolated runtime by default.',
    'createSourcePluginProject.defaultName': 'My Source',
    'createSourcePluginProject.name': 'Plugin name',
    'createSourcePluginProject.pluginId': 'Plugin ID',
    'createSourcePluginProject.version': 'Version',
    'createSourcePluginProject.hosts': 'Source domains',
    'createSourcePluginProject.hostsHint': 'Comma-separated hostnames',
    'createSourcePluginProject.titleSelector': 'Title selector',
    'createSourcePluginProject.chapterListSelector': 'Chapter links',
    'createSourcePluginProject.chapterContentSelector': 'Chapter content',
    'createSourcePluginProject.capabilities': 'Capabilities',
    'createSourcePluginProject.capability.identify': 'Identify URL',
    'createSourcePluginProject.capability.metadata': 'Novel metadata',
    'createSourcePluginProject.capability.chapter-list': 'Chapter list',
    'createSourcePluginProject.capability.chapter-content': 'Chapter content',
    'createSourcePluginProject.action': 'Create workspace'
  },
  vi: {
    'createSourcePluginProject.title': 'Khoi tao plugin SDK sach',
    'createSourcePluginProject.description':
      'Khong cai package, khong truy cap Node ngam, mac dinh chay trong moi truong cach ly.',
    'createSourcePluginProject.defaultName': 'Nguon cua toi',
    'createSourcePluginProject.name': 'Ten plugin',
    'createSourcePluginProject.pluginId': 'Plugin ID',
    'createSourcePluginProject.version': 'Phien ban',
    'createSourcePluginProject.hosts': 'Ten mien nguon',
    'createSourcePluginProject.hostsHint': 'Phan tach cac hostname bang dau phay',
    'createSourcePluginProject.titleSelector': 'Selector tieu de',
    'createSourcePluginProject.chapterListSelector': 'Lien ket chuong',
    'createSourcePluginProject.chapterContentSelector': 'Noi dung chuong',
    'createSourcePluginProject.capabilities': 'Kha nang',
    'createSourcePluginProject.capability.identify': 'Nhan dien URL',
    'createSourcePluginProject.capability.metadata': 'Metadata truyen',
    'createSourcePluginProject.capability.chapter-list': 'Danh sach chuong',
    'createSourcePluginProject.capability.chapter-content': 'Noi dung chuong',
    'createSourcePluginProject.action': 'Tao workspace'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
