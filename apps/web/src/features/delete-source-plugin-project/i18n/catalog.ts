import type { Catalog } from '../../../shared/i18n';

export const deleteSourcePluginProjectCatalogs = {
  en: {
    'deleteSourcePluginProject.action': 'Delete',
    'deleteSourcePluginProject.confirmTitle': 'Delete this Studio project?',
    'deleteSourcePluginProject.confirmDescription':
      'The saved draft for {name} will be permanently removed.',
    'deleteSourcePluginProject.deleted': 'Studio project deleted',
    'deleteSourcePluginProject.failed': 'Studio project could not be deleted'
  },
  vi: {
    'deleteSourcePluginProject.action': 'Xóa',
    'deleteSourcePluginProject.confirmTitle': 'Xóa dự án Studio này?',
    'deleteSourcePluginProject.confirmDescription':
      'Bản nháp đã lưu của {name} sẽ bị xóa vĩnh viễn.',
    'deleteSourcePluginProject.deleted': 'Đã xóa dự án Studio',
    'deleteSourcePluginProject.failed': 'Không thể xóa dự án Studio'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
