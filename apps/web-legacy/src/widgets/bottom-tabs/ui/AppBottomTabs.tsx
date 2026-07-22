import { Activity, BookOpen, Library, Plus, Settings } from 'lucide-react';
import { BottomNav } from '@/shared/ui';
import { useTaskSummary } from '@/entities/task/model/useTaskSummary';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function AppBottomTabs({
  onRouteIntent,
  onAddNovel
}: {
  onRouteIntent?: (href: string) => void;
  onAddNovel: () => void;
}) {
  const summary = useTaskSummary();
  const { t } = useI18n();
  const badge = summary.data?.activeCount ?? 0;
  return (
    <BottomNav
      items={[
        {
          id: 'library',
          label: t('nav.library'),
          href: '/library',
          icon: <Library size={20} strokeWidth={1.85} />,
          onIntent: () => onRouteIntent?.('/library')
        },
        {
          id: 'activity',
          label: t('nav.activity'),
          href: '/activity',
          icon: <Activity size={20} strokeWidth={1.85} />,
          badge,
          onIntent: () => onRouteIntent?.('/activity')
        },
        {
          kind: 'action',
          id: 'add',
          label: t('library.importNovel'),
          icon: <Plus size={24} strokeWidth={2.2} />,
          onClick: onAddNovel
        },
        {
          id: 'sources',
          label: t('nav.sources'),
          href: '/sources',
          icon: <BookOpen size={20} strokeWidth={1.85} />,
          onIntent: () => onRouteIntent?.('/sources')
        },
        {
          id: 'settings',
          label: t('nav.settings'),
          href: '/settings',
          icon: <Settings size={20} strokeWidth={1.85} />,
          onIntent: () => onRouteIntent?.('/settings')
        }
      ]}
    />
  );
}
