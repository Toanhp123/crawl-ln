import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useI18n } from '../../i18n/I18nProvider';

export type BottomNavItem =
  | {
      kind?: 'route';
      id: string;
      label: string;
      icon: ReactNode;
      href: string;
      badge?: number;
      activeOn?: string[];
      onIntent?: () => void;
    }
  | {
      kind: 'action';
      id: string;
      label: string;
      icon: ReactNode;
      onClick: () => void;
      badge?: number;
    };

function ItemContent({ item, active = false }: { item: BottomNavItem; active?: boolean }) {
  return (
    <span
      data-focus-contained="true"
      className={cn(
        'relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-2 pb-1 pt-1 transition-[color,background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:scale-[.98]',
        active ? 'text-primary' : 'group-hover:text-text',
        'group-focus-visible:shadow-[var(--focus-ring)]',
        item.kind === 'action' && '-translate-y-3 text-primary'
      )}
    >
      <span
        className={cn(
          'relative grid h-[1.5rem] min-w-7 place-items-center',
          item.kind === 'action' &&
            'relative z-10 grid h-12 w-12 min-w-12 shrink-0 aspect-square rounded-full bg-primary p-0 text-white shadow-[var(--elevation-2)]'
        )}
      >
        {item.icon}
        {item.badge && item.badge > 0 ? (
          <span className="absolute -right-2 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[hsl(var(--color-bg-elevated))] bg-danger px-1 type-caption font-bold text-white">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        ) : null}
      </span>
      {item.kind !== 'action' ? (
        <span className="w-full truncate px-0.5 text-center">{item.label}</span>
      ) : null}
    </span>
  );
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t('common.mainNavigation')}
      className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-border bg-[hsl(var(--color-bg-elevated)/.97)] pb-[env(safe-area-inset-bottom)] shadow-[var(--elevation-1)] backdrop-blur-xl md:hidden"
    >
      <div
        className="mx-auto grid h-[var(--app-nav-height)] w-full max-w-[var(--app-mobile-max)] px-1.5"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) =>
          item.kind === 'action' ? (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-label={item.label}
              className="group relative flex min-h-[var(--touch-target)] items-stretch justify-center rounded-[var(--radius-md)] p-0 type-caption font-medium text-muted outline-none"
            >
              <ItemContent item={item} />
            </button>
          ) : (
            <NavLink
              key={item.id}
              to={item.href}
              onPointerEnter={item.onIntent}
              onFocus={item.onIntent}
              onTouchStart={item.onIntent}
              className="group relative flex min-h-[var(--touch-target)] items-stretch justify-center rounded-[var(--radius-md)] type-caption font-medium text-muted outline-none focus-visible:outline-none"
            >
              {({ isActive }) => <ItemContent item={item} active={isActive} />}
            </NavLink>
          )
        )}
      </div>
    </nav>
  );
}
