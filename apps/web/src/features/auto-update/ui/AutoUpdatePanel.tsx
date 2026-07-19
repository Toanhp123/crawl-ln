import type { AutoUpdateInterval, Novel, NovelUpdateDiagnostic } from '@novel-tool/shared';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  TriangleAlert
} from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  ListRow,
  SegmentedControl,
  Surface,
  Switch,
  Text,
  type ActionState
} from '@/shared/ui';
import type { TranslationKey } from '@/shared/i18n/I18nProvider';

const intervals: Array<{ id: AutoUpdateInterval; key: TranslationKey }> = [
  { id: 360, key: 'autoUpdate.interval.6h' },
  { id: 720, key: 'autoUpdate.interval.12h' },
  { id: 1440, key: 'autoUpdate.interval.daily' },
  { id: 10080, key: 'autoUpdate.interval.weekly' }
];

export function AutoUpdatePanel({
  novel,
  diagnostics,
  actionState,
  t,
  relativeTime,
  onChange
}: {
  novel: Novel;
  diagnostics: NovelUpdateDiagnostic[];
  actionState: ActionState;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  relativeTime: (value: string | number | Date) => string;
  onChange: (enabled: boolean, intervalMinutes: AutoUpdateInterval) => void;
}) {
  const enabled = novel.autoUpdateEnabled ?? false;
  const interval = novel.updateIntervalMinutes ?? 1440;
  const [expanded, setExpanded] = useState(false);
  const [actionTarget, setActionTarget] = useState<'toggle' | 'interval' | null>(null);
  const intervalLabel = t(
    intervals.find((item) => item.id === interval)?.key ?? 'autoUpdate.interval.daily'
  );
  const pending = actionState === 'pending';

  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface2 text-primary">
          <CalendarClock size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="section">{t('autoUpdate.title')}</Text>
            <Badge tone={enabled ? 'success' : 'neutral'}>
              {enabled ? t('autoUpdate.enabled') : t('autoUpdate.disabled')}
            </Badge>
          </div>
          <Text variant="supporting" tone="muted" className="mt-1 line-clamp-1">
            {enabled
              ? `${intervalLabel} · ${t('autoUpdate.nextCheck')}: ${
                  novel.nextUpdateCheckAt
                    ? relativeTime(novel.nextUpdateCheckAt)
                    : t('autoUpdate.notScheduled')
                }`
              : t('autoUpdate.description')}
          </Text>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
          {t('autoUpdate.manage')}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>
      {expanded ? (
        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <Text variant="bodySm" className="font-semibold">
              {t('autoUpdate.interval')}
            </Text>
            <Switch
              checked={enabled}
              actionState={actionTarget === 'toggle' ? actionState : 'idle'}
              disabled={pending}
              aria-label={t('autoUpdate.toggleLabel')}
              className="min-h-0 w-auto border-0 bg-transparent p-0 hover:bg-transparent"
              onCheckedChange={(checked) => {
                setActionTarget('toggle');
                onChange(checked, interval);
              }}
            />
          </div>
          <div className="mt-3">
            <SegmentedControl
              value={String(interval)}
              columns={4}
              ariaLabel={t('autoUpdate.interval')}
              disabled={pending}
              items={intervals.map((item) => ({ id: String(item.id), label: t(item.key) }))}
              onChange={(value) => {
                setActionTarget('interval');
                onChange(true, Number(value) as AutoUpdateInterval);
              }}
            />
          </div>
          <div className="mt-3 grid gap-2 type-caption text-muted sm:grid-cols-2">
            <span>
              {t('autoUpdate.lastCheck')}:{' '}
              {novel.lastUpdateCheckAt
                ? relativeTime(novel.lastUpdateCheckAt)
                : t('autoUpdate.never')}
            </span>
            <span>
              {t('autoUpdate.nextCheck')}:{' '}
              {novel.nextUpdateCheckAt
                ? relativeTime(novel.nextUpdateCheckAt)
                : t('autoUpdate.notScheduled')}
            </span>
          </div>
          <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-border">
            {diagnostics.length ? (
              diagnostics
                .slice(0, 5)
                .map((entry) => (
                  <ListRow
                    key={entry.id}
                    divided
                    leading={
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2">
                        {entry.result === 'failed' ? (
                          <TriangleAlert size={17} />
                        ) : entry.result === 'queued' ? (
                          <CalendarClock size={17} />
                        ) : (
                          <CheckCircle2 size={17} />
                        )}
                      </span>
                    }
                    title={entry.message}
                    description={`${relativeTime(entry.createdAt)} · ${entry.durationMs}ms`}
                    meta={
                      entry.newChapterCount
                        ? t('autoUpdate.newChapters', { count: entry.newChapterCount })
                        : undefined
                    }
                  />
                ))
            ) : (
              <div className="p-4">
                <Text variant="supporting" tone="muted">
                  <Clock3 size={15} className="mr-2 inline" />
                  {t('autoUpdate.noHistory')}
                </Text>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Surface>
  );
}
