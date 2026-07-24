import {
  BookOpen,
  CalendarClock,
  Database,
  Download,
  Info,
  Languages,
  Palette,
  Search
} from 'lucide-react';
import { useState } from 'react';
import { AppFontControls, useAppFontConfiguration } from '@/features/configure-app-font';
import { AppearanceControls, useAppearanceConfiguration } from '@/features/configure-appearance';
import { LanguageControls, useLanguageConfiguration } from '@/features/configure-language';
import { ReaderPreferencesSheet } from '@/features/reader-preferences';
import { RebuildSearchIndexButton } from '@/features/rebuild-search-index';
import { SchedulerControls } from '@/features/run-scheduler';
import { BackupLibraryPanel } from '@/features/backup-library';
import { APP_BUILD, APP_VERSION } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import {
  BottomSheet,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  IconTile,
  ListRow,
  Page,
  PageHeader,
  Panel,
  Section,
  Stack,
  Text
} from '@/shared/ui';
import { SystemHealthCard } from '@/widgets/system-health';
import { SettingsHubCard } from './SettingsHubCard';

type SettingsPanel =
  | 'appearance'
  | 'language'
  | 'reader'
  | 'scheduler'
  | 'storage'
  | 'search'
  | 'export'
  | 'about'
  | null;

export function SettingsPage() {
  const { t } = useI18n();
  const [panel, setPanel] = useState<SettingsPanel>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const appearance = useAppearanceConfiguration();
  const language = useLanguageConfiguration();
  const appFont = useAppFontConfiguration();

  return (
    <Page className="max-w-5xl">
      <PageHeader title={t('nav.settings')} description={t('settings.hubDescription')} />
      <SystemHealthCard />

      <Section title={t('settings.tasks')}>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsHubCard
            icon={<Database size={20} />}
            title={t('settings.dataSafety')}
            description={t('settings.dataSafetyDescription')}
            status={t('settings.local')}
            onClick={() => setPanel('storage')}
          />
          <SettingsHubCard
            icon={<Download size={20} />}
            title={t('settings.exportTitle')}
            description={t('settings.exportDescription')}
            onClick={() => setPanel('export')}
          />
          <SettingsHubCard
            icon={<CalendarClock size={20} />}
            title={t('scheduler.title')}
            description={t('settings.schedulerDescription')}
            onClick={() => setPanel('scheduler')}
          />
          <SettingsHubCard
            icon={<Search size={20} />}
            title={t('search.indexTitle')}
            description={t('search.indexDescription')}
            onClick={() => setPanel('search')}
          />
          <SettingsHubCard
            icon={<Info size={20} />}
            title={t('settings.about')}
            description={`${t('settings.version')} ${APP_VERSION}`}
            onClick={() => setPanel('about')}
          />
        </div>
      </Section>

      <Section title={t('settings.preferences')}>
        <div className="grid gap-3 md:grid-cols-3" data-settings-preferences-grid="">
          <SettingsHubCard
            cardId="appearance"
            icon={<Palette size={20} />}
            title={t('settings.appearance')}
            description={t('settings.appearanceDescription')}
            currentValue={`${appearance.summary} · ${appFont.currentLabel}`}
            onClick={() => setPanel('appearance')}
          />
          <SettingsHubCard
            cardId="language"
            icon={<Languages size={20} />}
            title={t('settings.language')}
            description={t('settings.languageDescription')}
            currentValue={language.currentLabel}
            onClick={() => setPanel('language')}
          />
          <SettingsHubCard
            cardId="reader"
            icon={<BookOpen size={20} />}
            title={t('settings.reader')}
            description={t('settings.readerDescription')}
            onClick={() => setReaderOpen(true)}
          />
        </div>
      </Section>

      <BottomSheet
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
        title={panel ? t(`settings.panel.${panel}`) : ''}
      >
        {panel === 'appearance' ? (
          <Stack gap="lg">
            <AppearanceControls />
            <AppFontControls />
          </Stack>
        ) : null}
        {panel === 'language' ? <LanguageControls /> : null}
        {panel === 'scheduler' ? <SchedulerControls /> : null}
        {panel === 'storage' ? <BackupLibraryPanel /> : null}
        {panel === 'search' ? (
          <Panel className="space-y-3">
            <Text variant="supporting" tone="muted">
              {t('search.indexDescription')}
            </Text>
            <RebuildSearchIndexButton />
          </Panel>
        ) : null}
        {panel === 'export' ? (
          <Panel className="space-y-3">
            <Text as="h3" variant="cardTitle">
              {t('settings.exportFromNovel')}
            </Text>
            <Text variant="supporting" tone="muted">
              {t('settings.exportFromNovelDescription')}
            </Text>
            <div className="flex flex-wrap gap-2">
              <Chip selected>EPUB</Chip>
              <Chip selected>TXT</Chip>
            </div>
          </Panel>
        ) : null}
        {panel === 'about' ? (
          <Card padding="none" elevation="flat" className="overflow-hidden">
            <ListRow
              title={t('settings.version')}
              trailing={<Text variant="supporting">{APP_VERSION}</Text>}
              divided
            />
            <ListRow
              title={t('settings.build')}
              trailing={<Text variant="supporting">{APP_BUILD}</Text>}
            />
          </Card>
        ) : null}
      </BottomSheet>

      <ReaderPreferencesSheet open={readerOpen} onOpenChange={setReaderOpen} />
    </Page>
  );
}
