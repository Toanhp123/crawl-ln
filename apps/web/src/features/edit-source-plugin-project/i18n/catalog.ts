import type { Catalog } from '../../../shared/i18n';

export const editSourcePluginProjectCatalogs = {
  en: {
    'editSourcePluginProject.clean': 'Draft saved',
    'editSourcePluginProject.dirty': 'Unsaved changes',
    'editSourcePluginProject.saving': 'Saving draft...',
    'editSourcePluginProject.saved': 'Draft saved',
    'editSourcePluginProject.conflict': 'Save conflict',
    'editSourcePluginProject.error': 'Save failed',
    'editSourcePluginProject.conflictTitle': 'This draft changed on the server',
    'editSourcePluginProject.conflictDescription':
      'Autosave is paused to protect your local code. Reload the server draft to continue.',
    'editSourcePluginProject.reload': 'Reload server draft',
    'editSourcePluginProject.errorTitle': 'Draft could not be saved'
  },
  vi: {
    'editSourcePluginProject.clean': 'Da luu draft',
    'editSourcePluginProject.dirty': 'Co thay doi chua luu',
    'editSourcePluginProject.saving': 'Dang luu draft...',
    'editSourcePluginProject.saved': 'Da luu draft',
    'editSourcePluginProject.conflict': 'Xung dot khi luu',
    'editSourcePluginProject.error': 'Luu that bai',
    'editSourcePluginProject.conflictTitle': 'Draft tren server da thay doi',
    'editSourcePluginProject.conflictDescription':
      'Autosave da tam dung de bao ve code cuc bo. Tai lai draft tren server de tiep tuc.',
    'editSourcePluginProject.reload': 'Tai lai draft server',
    'editSourcePluginProject.errorTitle': 'Khong the luu draft'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
