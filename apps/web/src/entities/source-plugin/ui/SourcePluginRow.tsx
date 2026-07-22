import type { ReactNode } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Badge, ListRow, Text } from '../../../shared/ui';
import { sourcePluginTone } from '../model/source-plugin';
import type { SourcePlugin } from '../model/types';

export function SourcePluginRow({
  plugin,
  trailing,
  onOpen
}: {
  plugin: SourcePlugin;
  trailing?: ReactNode;
  onOpen?: () => void;
}) {
  const { number, status, t } = useI18n();
  const version = plugin.activeVersion
    ? t('sources.plugins.version', { value: plugin.activeVersion })
    : '—';

  return (
    <ListRow
      {...(onOpen ? { onClick: onOpen } : {})}
      title={plugin.name}
      description={plugin.domains.join(', ') || plugin.id}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={sourcePluginTone(plugin)}>{status(plugin.status)}</Badge>
          <Text variant="caption" tone="muted">
            {version} · {number(plugin.capabilities.length)}
          </Text>
        </span>
      }
      trailing={trailing}
      showChevron={Boolean(onOpen) && !trailing}
    />
  );
}
