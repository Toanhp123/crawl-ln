import { Activity, Clock3, Globe2 } from 'lucide-react';
import { Badge, Card, Panel, Switch, Text, type ActionState } from '@/shared/ui';
import type { SourcePlugin } from '@/features/manage-source-plugins/api/sourcePlugins';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function SourceProfileCard({
  plugin,
  onOpen,
  onToggle,
  actionState,
  disabled = false
}: {
  plugin: SourcePlugin;
  onOpen: () => void;
  onToggle: (checked: boolean) => void;
  actionState: ActionState;
  disabled?: boolean;
}) {
  const { t, status, number } = useI18n();
  const tone =
    !plugin.enabled || plugin.status === 'disabled'
      ? 'neutral'
      : plugin.status === 'active'
        ? 'success'
        : 'warning';
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <Text as="h3" variant="title">
              {plugin.manifest.name}
            </Text>
            <Badge tone={tone}>{status(plugin.status)}</Badge>
          </div>
          <Text variant="supporting" tone="muted" className="mt-1 flex items-center gap-1">
            <Globe2 size={15} /> {plugin.manifest.match.join(', ')}
          </Text>
        </button>
        <Switch
          checked={plugin.enabled}
          actionState={actionState}
          disabled={disabled}
          aria-label={t('sources.toggleLabel', { name: plugin.manifest.name })}
          className="min-h-0 w-auto border-0 bg-transparent p-0 hover:bg-transparent"
          onCheckedChange={onToggle}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Panel tone="inset" padding="sm" className="text-center">
          <Activity size={15} className="mx-auto mb-1" />
          <Text variant="label">{number(plugin.health.successCount)}</Text>
          <Text variant="caption" tone="muted">
            {t('sources.success')}
          </Text>
        </Panel>
        <Panel tone="inset" padding="sm" className="text-center">
          <Text variant="label">{number(plugin.health.failureCount)}</Text>
          <Text variant="caption" tone="muted">
            {t('sources.failures')}
          </Text>
        </Panel>
        <Panel tone="inset" padding="sm" className="text-center">
          <Clock3 size={15} className="mx-auto mb-1" />
          <Text variant="label">{number(Math.round(plugin.health.averageLatencyMs))} ms</Text>
          <Text variant="caption" tone="muted">
            {t('sources.latency')}
          </Text>
        </Panel>
      </div>
    </Card>
  );
}
