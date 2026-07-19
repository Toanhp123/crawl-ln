import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button } from '../actions/Button';

export function Pagination({
  page,
  totalPages,
  onChange
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-border bg-surface2/35 p-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} /> {t('common.previous')}
      </Button>
      <span className="type-caption font-bold text-muted">
        {page}/{totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {t('common.next')} <ChevronRight size={16} />
      </Button>
    </div>
  );
}
