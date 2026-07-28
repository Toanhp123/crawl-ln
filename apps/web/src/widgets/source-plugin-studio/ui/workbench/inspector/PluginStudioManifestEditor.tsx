import type { SourcePluginStudioCapability } from '../../../../../entities/source-plugin-project';
import {
  sourcePluginStudioCapabilities,
  type SourcePluginStudioManifestState,
  updateSourcePluginStudioManifest
} from '../../../../../entities/source-plugin-project';
import { useI18n } from '../../../../../shared/i18n';
import { Button, Field, FilterChip, InlineNotice, Input, Text } from '../../../../../shared/ui';

export function PluginStudioManifestEditor({
  source,
  state,
  disabled,
  onChange,
  onOpenManifest
}: {
  source: string;
  state: SourcePluginStudioManifestState;
  disabled: boolean;
  onChange: (source: string) => void;
  onOpenManifest: () => void;
}) {
  const { t } = useI18n();
  if (!state.valid || !state.metadata) {
    return (
      <div className="border-b border-border bg-surface p-3">
        <InlineNotice
          tone="warning"
          title={t('pluginStudio.manifestInvalid')}
          action={
            <Button size="sm" variant="secondary" onClick={onOpenManifest}>
              {t('pluginStudio.openManifest')}
            </Button>
          }
        >
          {state.error ?? t('pluginStudio.manifestInvalidDescription')}
        </InlineNotice>
      </div>
    );
  }

  const update = (patch: Parameters<typeof updateSourcePluginStudioManifest>[1]) => {
    onChange(updateSourcePluginStudioManifest(source, patch));
  };
  const metadata = state.metadata;

  return (
    <fieldset className="bg-surface p-3" disabled={disabled}>
      <div className="grid gap-4 pt-2">
        <Field label={t('pluginStudio.pluginName')}>
          <Input
            key={metadata.name}
            defaultValue={metadata.name}
            onBlur={(event) => update({ name: event.target.value })}
          />
        </Field>
        <Field label={t('pluginStudio.pluginId')}>
          <Input
            className="font-mono"
            key={metadata.pluginId}
            defaultValue={metadata.pluginId}
            onBlur={(event) => update({ pluginId: event.target.value })}
          />
        </Field>
        <Field label={t('pluginStudio.pluginVersion')}>
          <Input
            className="font-mono"
            key={metadata.version}
            defaultValue={metadata.version}
            onBlur={(event) => update({ version: event.target.value })}
          />
        </Field>
        <Field label={t('pluginStudio.hosts')}>
          <Input
            key={metadata.hosts.join(',')}
            className="font-mono"
            defaultValue={metadata.hosts.join(', ')}
            onBlur={(event) => update({ hosts: event.target.value.split(',') })}
          />
        </Field>
        <div className="grid gap-2.5">
          <Text variant="caption" tone="muted" className="font-bold uppercase tracking-wide">
            {t('pluginStudio.capabilities')}
          </Text>
          <div className="flex flex-wrap gap-2">
            {sourcePluginStudioCapabilities.map((capability) => {
              const selected = metadata.capabilities.includes(capability);
              return (
                <FilterChip
                  key={capability}
                  selected={selected}
                  aria-pressed={selected}
                  disabled={selected && metadata.capabilities.length === 1}
                  onClick={() => {
                    const next = selected
                      ? metadata.capabilities.filter((item) => item !== capability)
                      : [...metadata.capabilities, capability];
                    update({ capabilities: next as SourcePluginStudioCapability[] });
                  }}
                >
                  {capability}
                </FilterChip>
              );
            })}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
