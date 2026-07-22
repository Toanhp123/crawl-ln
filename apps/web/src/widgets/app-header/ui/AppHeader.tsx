import { BookOpenText } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';

export function AppHeader({ onRouteIntent }: { onRouteIntent?: (href: string) => void }) {
  const { t } = useI18n();
  const intent = () => onRouteIntent?.('/library');

  return (
    <header className="safe-top z-30 shrink-0 border-b border-border bg-[hsl(var(--color-bg-elevated)/0.92)] backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--height-header)] w-full max-w-[var(--content-max)] items-center px-[var(--page-x)]">
        <NavLink
          to="/library"
          onPointerEnter={intent}
          onFocus={intent}
          onTouchStart={intent}
          className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] text-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-primary-state-border bg-primary-subtle text-primary">
            <BookOpenText size={20} />
          </span>
          <span className="min-w-0">
            <span className="block truncate type-title-sm font-semibold">Novel Tool</span>
            <span className="block truncate type-caption font-bold uppercase tracking-[var(--tracking-eyebrow)] text-muted">
              {t('app.subtitle')}
            </span>
          </span>
        </NavLink>
      </div>
    </header>
  );
}
