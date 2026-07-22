import type { Catalog } from '../../../shared/i18n';

export const taskCatalogs = {
  en: {
    'tasks.progress': '{fetched}/{total} fetched · {failed} failed',
    'common.status.idle': 'Idle',
    'common.status.pausing': 'Pausing',
    'common.status.paused': 'Paused',
    'common.status.resuming': 'Resuming'
  },
  vi: {
    'tasks.progress': '{fetched}/{total} đã tải · {failed} lỗi',
    'common.status.idle': 'Chờ',
    'common.status.pausing': 'Đang tạm dừng',
    'common.status.paused': 'Đã tạm dừng',
    'common.status.resuming': 'Đang tiếp tục'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
