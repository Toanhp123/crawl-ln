import type { AutoUpdateInterval } from '@novel-tool/shared';
import type { Novel } from '../../../entities/novel';
import { useI18n } from '../../../shared/i18n';
import { SegmentedControl, Stack, Switch, Text } from '../../../shared/ui';
import { useUpdateAutoUpdate } from '../model/use-update-auto-update';

const intervals: AutoUpdateInterval[] = [360, 720, 1440, 10080];

export function AutoUpdateControl({ novel }: { novel: Novel }) {
  const mutation = useUpdateAutoUpdate();
  const { t } = useI18n();
  const enabled = novel.autoUpdateEnabled ?? false;
  const interval = novel.updateIntervalMinutes ?? 1440;
  const update = (nextEnabled: boolean, nextInterval: AutoUpdateInterval) =>
    mutation.mutate({ novelId: novel.id, enabled: nextEnabled, intervalMinutes: nextInterval });

  return (
    <Stack gap="sm">
      <Switch
        checked={enabled}
        actionState={mutation.status}
        label={t('autoUpdate.title')}
        description={t('autoUpdate.description')}
        onCheckedChange={(value) => update(value, interval)}
      />
      <div>
        <Text variant="caption" tone="muted" className="mb-2 block">
          {t('autoUpdate.interval')}
        </Text>
        <SegmentedControl
          value={String(interval)}
          columns={4}
          disabled={mutation.isPending}
          ariaLabel={t('autoUpdate.interval')}
          items={intervals.map((value) => ({
            id: String(value),
            label: t(`autoUpdate.interval.${value}`)
          }))}
          onChange={(value) => update(enabled, Number(value) as AutoUpdateInterval)}
        />
      </div>
    </Stack>
  );
}
