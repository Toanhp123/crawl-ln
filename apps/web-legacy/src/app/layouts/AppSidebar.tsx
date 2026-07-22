import { Activity, BookOpen, Library, Plus, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Button, Text } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { useGlobalAddNovel } from '@/shared/model/GlobalAddNovelContext';
import { useTaskSummary } from '@/entities/task/model/useTaskSummary';
import { preloadRoute } from '@/app/router/routePreload';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function AppSidebar() {
  const addNovel = useGlobalAddNovel();
  const { t } = useI18n();
  const items = [
    { href: '/library', label: t('nav.library'), icon: Library },
    { href: '/activity', label: t('nav.activity'), icon: Activity },
    { href: '/sources', label: t('nav.sources'), icon: BookOpen },
    { href: '/settings', label: t('nav.settings'), icon: Settings }
  ];
  const summary = useTaskSummary();
  return (
    <aside className="hidden h-full w-64 shrink-0 border-r border-border bg-[hsl(var(--color-bg-elevated)/.92)] p-4 backdrop-blur-xl md:flex md:flex-col">
      <div className="px-2 py-3">
        <Text as="div" variant="title">
          Novel Tool
        </Text>
        <Text variant="caption" tone="muted">
          {t('app.subtitle')}
        </Text>
      </div>
      <Button className="mt-3 w-full justify-start" onClick={addNovel.open}>
        <Plus size={18} /> {t('library.importNovel')}
      </Button>
      <nav className="mt-5 space-y-1" aria-label={t('common.mainNavigation')}>
        {items.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            onPointerEnter={() => preloadRoute(href)}
            className={({ isActive }) =>
              cn(
                'flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 type-supporting font-medium transition-colors',
                isActive
                  ? 'bg-surface2 text-primary'
                  : 'text-muted hover:bg-surface2 hover:text-text'
              )
            }
          >
            <Icon size={19} />
            <span className="flex-1">{label}</span>
            {href === '/activity' && (summary.data?.activeCount ?? 0) > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 type-caption text-white">
                {summary.data?.activeCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <Text variant="caption" tone="muted" className="mt-auto px-2 py-3">
        {t('app.localData')}
      </Text>
    </aside>
  );
}
