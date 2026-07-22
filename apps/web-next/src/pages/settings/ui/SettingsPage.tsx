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
import { useState, type ReactNode } from 'react';
import { AppearanceControls } from '@/features/configure-appearance';
import { LanguageControls } from '@/features/configure-language';
import { ReaderPreferencesSheet } from '@/features/reader-preferences';
import { RebuildSearchIndexButton } from '@/features/rebuild-search-index';
import { RunSchedulerButton } from '@/features/run-scheduler';
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
  Page,
  PageHeader,
  Panel,
  Section,
  Text
} from '@/shared/ui';
import { SystemHealthCard } from '@/widgets/system-health';

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

function SettingsHubCard({
  icon,
  title,
  description,
  status,
  onClick
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="block w-full text-left" onClick={onClick}>
      <Card interactive>
        <CardHeader className="items-center">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile size="md" tone="primary">
              {icon}
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{title}</CardTitle>
                {status ? <Chip tone="info">{status}</Chip> : null}
              </div>
              <CardDescription className="max-w-[36ch]">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    </button>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const [panel, setPanel] = useState<SettingsPanel>(null);
  const [readerOpen, setReaderOpen] = useState(false);

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
        <div className="grid gap-3 md:grid-cols-3">
          <SettingsHubCard
            icon={<Palette size={20} />}
            title={t('settings.appearance')}
            description={t('settings.appearanceDescription')}
            onClick={() => setPanel('appearance')}
          />
          <SettingsHubCard
            icon={<Languages size={20} />}
            title={t('settings.language')}
            description={t('settings.languageDescription')}
            onClick={() => setPanel('language')}
          />
          <SettingsHubCard
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
        {panel === 'appearance' ? <AppearanceControls /> : null}
        {panel === 'language' ? <LanguageControls /> : null}
        {panel === 'scheduler' ? (
          <Panel className="space-y-3">
            <Text variant="supporting" tone="muted">
              {t('settings.schedulerDescription')}
            </Text>
            <RunSchedulerButton />
          </Panel>
        ) : null}
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
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Text variant="label">{t('settings.version')}</Text>
              <Text variant="supporting">{APP_VERSION}</Text>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Text variant="label">{t('settings.build')}</Text>
              <Text variant="supporting">{APP_BUILD}</Text>
            </div>
          </Card>
        ) : null}
      </BottomSheet>

      <ReaderPreferencesSheet open={readerOpen} onOpenChange={setReaderOpen} />
    </Page>
  );
}
