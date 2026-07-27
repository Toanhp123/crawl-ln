import type { SourcePluginStudioCapability } from '../../../entities/source-plugin-project';
import {
  sourcePluginStudioCapabilities,
  type SourcePluginStudioManifestState,
  updateSourcePluginStudioManifest
} from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Badge, Button, InlineNotice } from '../../../shared/ui';

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
    <fieldset className="border-b border-border bg-surface p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('pluginStudio.manifestMetadata')}
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('pluginStudio.pluginName')}
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            key={metadata.name}
            defaultValue={metadata.name}
            onBlur={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('pluginStudio.pluginId')}
          <input
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
            key={metadata.pluginId}
            defaultValue={metadata.pluginId}
            onBlur={(event) => update({ pluginId: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('pluginStudio.pluginVersion')}
          <input
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
            key={metadata.version}
            defaultValue={metadata.version}
            onBlur={(event) => update({ version: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('pluginStudio.hosts')}
          <input
            key={metadata.hosts.join(',')}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
            defaultValue={metadata.hosts.join(', ')}
            onBlur={(event) => update({ hosts: event.target.value.split(',') })}
          />
        </label>
        <div className="grid gap-1 text-xs font-medium text-muted-foreground">
          {t('pluginStudio.capabilities')}
          <div className="flex flex-wrap gap-2">
            {sourcePluginStudioCapabilities.map((capability) => {
              const selected = metadata.capabilities.includes(capability);
              return (
                <label
                  key={capability}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={selected && metadata.capabilities.length === 1}
                    onChange={() => {
                      const next = selected
                        ? metadata.capabilities.filter((item) => item !== capability)
                        : [...metadata.capabilities, capability];
                      update({ capabilities: next as SourcePluginStudioCapability[] });
                    }}
                  />
                  <Badge>{capability}</Badge>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
