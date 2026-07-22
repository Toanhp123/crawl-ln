import { useState } from 'react';
import {
  BookOpen,
  Database,
  Download,
  Info,
  Languages,
  Palette,
  Type,
  CalendarClock,
  Search,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  Page,
  PageHeader,
  Panel,
  Section,
  Text
} from '@/shared/ui';
import { APP_BUILD, APP_VERSION } from '@/shared/config/build';
import type {
  AccentPreference,
  AppFontPreference,
  DensityPreference,
  ThemePreference
} from '@/shared/theme/runtime/ThemeProvider';
import { useSettingsPage } from '../model/useSettingsPage';
import type { TranslationKey } from '@/shared/i18n/I18nProvider';
import { SettingRow } from './SettingRow';
import { ReaderSettingsControls } from './ReaderSettingsControls';
import { BackupRestorePanel } from '@/features/backup-library/ui/BackupRestorePanel';
import { SearchIndexPanel } from '@/features/search-library/ui/SearchIndexPanel';
import { ChoiceGroup } from './ChoiceGroup';
import { SettingsHubCard } from './SettingsHubCard';
import { SystemHealthCard } from '@/widgets/system-health/ui/SystemHealthCard';

type SettingsPanel =
  | 'appearance'
  | 'language'
  | 'reader'
  | 'scheduler'
  | 'storage'
  | 'search'
  | 'font'
  | 'export'
  | 'about'
  | null;

const PANEL_TITLE_KEYS = {
  appearance: 'settings.appearance',
  language: 'settings.language',
  reader: 'settings.reader',
  scheduler: 'scheduler.title',
  storage: 'settings.dataSafety',
  search: 'search.indexTitle',
  font: 'settings.appFontSize',
  export: 'settings.exportTitle',
  about: 'settings.about'
} satisfies Record<Exclude<SettingsPanel, null>, TranslationKey>;

export function SettingsPage() {
  const model = useSettingsPage();
  const [panel, setPanel] = useState<SettingsPanel>(null);
  const schedulerHealthy = Boolean(model.scheduler.data?.running) && !model.scheduler.error;

  const panelTitle = panel ? model.t(PANEL_TITLE_KEYS[panel]) : '';

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title={model.t('nav.settings')}
        description={model.t('settings.hubDescription')}
      />

      <SystemHealthCard
        t={model.t}
        schedulerHealthy={schedulerHealthy}
        monitoredNovels={model.scheduler.data?.monitoredNovels ?? 0}
      />

      <Section title={model.t('settings.tasks')}>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsHubCard
            icon={<Database size={20} />}
            title={model.t('settings.dataSafety')}
            description={model.t('settings.dataSafetyDescription')}
            status={model.t('settings.local')}
            statusTone="info"
            onClick={() => setPanel('storage')}
          />
          <SettingsHubCard
            icon={<Download size={20} />}
            title={model.t('settings.exportTitle')}
            description={model.t('settings.exportDescription')}
            onClick={() => setPanel('export')}
          />
          <SettingsHubCard
            icon={<CalendarClock size={20} />}
            title={model.t('scheduler.title')}
            description={model.t('settings.schedulerDescription')}
            status={schedulerHealthy ? model.t('scheduler.running') : model.t('scheduler.stopped')}
            statusTone={schedulerHealthy ? 'success' : 'warning'}
            onClick={() => setPanel('scheduler')}
          />
          <SettingsHubCard
            icon={<Search size={20} />}
            title={model.t('search.indexTitle')}
            description={model.t('search.indexDescription')}
            onClick={() => setPanel('search')}
          />
          <SettingsHubCard
            icon={<ShieldCheck size={20} />}
            title={model.t('settings.about')}
            description={`${model.t('settings.version')} ${APP_VERSION}`}
            onClick={() => setPanel('about')}
          />
        </div>
      </Section>

      <Section title={model.t('settings.preferences')}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <SettingsHubCard
            icon={<Palette size={20} />}
            title={model.t('settings.appearance')}
            description={model.t(`settings.theme.${model.theme}` as never)}
            onClick={() => setPanel('appearance')}
          />
          <SettingsHubCard
            icon={<Languages size={20} />}
            title={model.t('settings.language')}
            description={model.t(
              model.language === 'vi' ? 'settings.language.vi' : 'settings.language.en'
            )}
            onClick={() => setPanel('language')}
          />
          <SettingsHubCard
            icon={<BookOpen size={20} />}
            title={model.t('settings.reader')}
            description={model.t('settings.readerDescription')}
            onClick={() => setPanel('reader')}
          />
          <SettingsHubCard
            icon={<Type size={20} />}
            title={model.t('settings.appFontSize')}
            description={model.valueLabel(model.appFont)}
            onClick={() => setPanel('font')}
          />
        </div>
      </Section>

      <BottomSheet
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
        title={panelTitle}
      >
        {panel === 'appearance' ? (
          <div className="space-y-5">
            <ChoiceGroup<ThemePreference>
              label={model.t('settings.appearance')}
              value={model.theme}
              items={model.themes}
              onChange={model.setTheme}
            />
            <ChoiceGroup<AccentPreference>
              label={model.t('settings.accent')}
              value={model.accent}
              items={model.accents}
              onChange={model.setAccent}
            />
            <ChoiceGroup<DensityPreference>
              label={model.t('settings.density')}
              value={model.density}
              items={model.densities}
              onChange={model.setDensity}
            />
          </div>
        ) : null}

        {panel === 'language' ? (
          <Card padding="none" elevation="flat" className="overflow-hidden">
            {model.languages.map((item) => (
              <SettingRow
                key={item.id}
                label={item.label}
                selected={model.language === item.id}
                onClick={() => model.setLanguage(item.id)}
              />
            ))}
          </Card>
        ) : null}

        {panel === 'reader' ? (
          <ReaderSettingsControls reader={model.reader} update={model.updateReader} t={model.t} />
        ) : null}

        {panel === 'scheduler' ? (
          <div className="space-y-3">
            <Card padding="none" elevation="flat" className="overflow-hidden">
              <SettingRow
                label={model.t('scheduler.state')}
                value={
                  model.scheduler.data?.running
                    ? model.t('scheduler.running')
                    : model.t('scheduler.stopped')
                }
              />
              <SettingRow
                label={model.t('scheduler.monitored')}
                value={String(model.scheduler.data?.monitoredNovels ?? 0)}
              />
              <SettingRow
                label={model.t('scheduler.due')}
                value={String(model.scheduler.data?.dueNovels ?? 0)}
              />
              <SettingRow
                label={model.t('scheduler.activeRuns')}
                value={String(model.scheduler.data?.activeRuns ?? 0)}
              />
            </Card>
            <Text variant="supporting" tone="muted">
              {model.t('scheduler.runNowDescription')}
            </Text>
            <Button
              variant="secondary"
              actionState={model.runScheduler.status}
              leadingIcon={<RefreshCw size={16} />}
              onClick={() => model.runScheduler.mutate()}
            >
              {model.t('scheduler.runNow')}
            </Button>
          </div>
        ) : null}

        {panel === 'search' ? <SearchIndexPanel t={model.t} /> : null}
        {panel === 'storage' ? <BackupRestorePanel t={model.t} /> : null}

        {panel === 'export' ? (
          <div className="space-y-4">
            <Panel className="space-y-3">
              <Text as="h3" variant="cardTitle">
                {model.t('settings.exportFromNovel')}
              </Text>
              <Text variant="supporting" tone="muted">
                {model.t('settings.exportFromNovelDescription')}
              </Text>
              <div className="flex flex-wrap gap-2">
                <Chip selected>EPUB</Chip>
                <Chip selected>TXT</Chip>
              </div>
            </Panel>
          </div>
        ) : null}

        {panel === 'font' ? (
          <div>
            <Panel>
              <Text as="p" variant="label" tone="secondary">
                {model.t('settings.fontPreview')}
              </Text>
              <Text as="p" variant="cardTitle" className="mt-2">
                {model.t('settings.fontPreviewTitle')}
              </Text>
              <Text as="p" variant="body" tone="secondary" className="mt-1">
                {model.t('settings.fontPreviewBody')}
              </Text>
            </Panel>
            <div
              className="mt-4 grid grid-cols-4 gap-2"
              aria-label={model.t('settings.appFontSize')}
            >
              {model.appFonts.map((item) => (
                <Chip
                  key={item.id}
                  selected={model.appFont === item.id}
                  onClick={() => model.setAppFont(item.id as AppFontPreference)}
                  className="justify-center px-1"
                >
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        {panel === 'about' ? (
          <Card padding="none" elevation="flat" className="overflow-hidden">
            <SettingRow label={model.t('settings.version')} value={APP_VERSION} />
            <SettingRow label={model.t('settings.build')} value={APP_BUILD} />
          </Card>
        ) : null}
      </BottomSheet>
    </Page>
  );
}
