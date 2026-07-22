import { ArrowDownAZ, BookOpenCheck, CalendarPlus, Clock3, LibraryBig } from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import { BottomSheet, Button, SegmentedControl, Text } from '@/shared/ui';
import type { LibraryFilter, LibrarySort } from '../model/use-library-page';

export function LibraryControlsSheet({
  open,
  onOpenChange,
  sort,
  filter,
  onSortChange,
  onFilterChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort: LibrarySort;
  filter: LibraryFilter;
  onSortChange: (sort: LibrarySort) => void;
  onFilterChange: (filter: LibraryFilter) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('library.controls')}
      description={t('library.controlsDescription')}
    >
      <div className="space-y-5 pb-2">
        <label className="grid gap-2">
          <Text variant="label">{t('library.sort')}</Text>
          <SegmentedControl
            value={sort}
            columns={2}
            ariaLabel={t('library.sort')}
            items={[
              {
                id: 'reading',
                label: t('library.sort.reading'),
                icon: <BookOpenCheck size={15} />
              },
              { id: 'recent', label: t('library.sort.recent'), icon: <Clock3 size={15} /> },
              { id: 'created', label: t('library.sort.created'), icon: <CalendarPlus size={15} /> },
              { id: 'title', label: t('library.sort.title'), icon: <ArrowDownAZ size={15} /> },
              { id: 'chapters', label: t('library.sort.chapters'), icon: <LibraryBig size={15} /> }
            ]}
            onChange={onSortChange}
          />
        </label>
        <label className="grid gap-2">
          <Text variant="label">{t('library.filter')}</Text>
          <SegmentedControl
            value={filter}
            columns={2}
            ariaLabel={t('library.filter')}
            items={[
              { id: 'all', label: t('library.filter.all') },
              { id: 'reading', label: t('library.filter.reading') },
              { id: 'unread', label: t('library.filter.unread') },
              { id: 'completed', label: t('library.filter.completed') },
              { id: 'importing', label: t('library.filter.importing') },
              { id: 'failed', label: t('library.filter.failed') }
            ]}
            onChange={onFilterChange}
          />
        </label>
        <Button full onClick={() => onOpenChange(false)}>
          {t('common.done')}
        </Button>
      </div>
    </BottomSheet>
  );
}
