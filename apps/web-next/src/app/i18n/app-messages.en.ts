import type { Catalog } from '@/shared/i18n';

export const appMessagesEn = {
  'app.subtitle': 'Local-first novel library',
  'app.localData': 'Your library stays on this device.',
  'nav.library': 'Library',
  'nav.activity': 'Activity',
  'nav.sources': 'Sources',
  'nav.settings': 'Settings',
  'common.skipToContent': 'Skip to content',
  'common.skipToReader': 'Skip to reader',
  'common.interfaceError': 'The interface stopped unexpectedly',
  'common.reload': 'Reload application',
  'common.requestFailed': 'The request failed.',
  'library.importNovel': 'Add novel',
  'maintenance.busy': 'Maintenance is already running.',
  'errors.notFound': 'The requested item was not found.',
  'errors.validation': 'Review the submitted information and try again.',
  'errors.forbidden': 'This action is not allowed.',
  'errors.conflict': 'The request conflicts with the current state.',
  'errors.network': 'The service could not be reached.',
  'errors.internal': 'The service encountered an internal error.'
} as const satisfies Catalog;
