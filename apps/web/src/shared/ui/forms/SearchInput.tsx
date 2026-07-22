import { Search, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Input } from './Input';
import { IconButton } from '../actions/IconButton';
import { cn } from '../../lib/cn';

export function SearchInput({
  value,
  onChange,
  placeholder,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        size={20}
      />
      <Input
        className="h-[var(--touch-target)] min-h-0 pl-11 pr-11"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t('common.search')}
      />
      {value ? (
        <IconButton
          className="absolute right-0 top-1/2 -translate-y-1/2"
          variant="ghost"
          aria-label={t('common.clearSearch')}
          onClick={() => onChange('')}
        >
          <X size={18} />
        </IconButton>
      ) : null}
    </div>
  );
}
