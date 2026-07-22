import type { SourceReaderPluginDescriptor } from '@novel-tool/shared';
import type { ReactNode } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Badge, ListRow, Text } from '@/shared/ui';
import { sourcePluginTone } from '../model/sourcePlugin';

export function SourcePluginRow({
  plugin,
  trailing,
  onOpen
}: {
  plugin: SourceReaderPluginDescriptor;
  trailing?: ReactNode;
  onOpen?: () => void;
}) {
  const { number, status } = useI18n();
  return (
    <ListRow
      {...(onOpen ? { onClick: onOpen } : {})}
      title={plugin.name}
      description={plugin.domains.join(', ') || plugin.id}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={sourcePluginTone(plugin)}>{status(plugin.status)}</Badge>
          <Text variant="caption" tone="muted">
            {plugin.activeVersion ?? '—'} · {number(plugin.capabilities.length)}
          </Text>
        </span>
      }
      trailing={trailing}
      showChevron={Boolean(onOpen) && !trailing}
    />
  );
}
