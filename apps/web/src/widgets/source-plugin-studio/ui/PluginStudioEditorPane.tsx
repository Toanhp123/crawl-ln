import { useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Text } from '../../../shared/ui';
import type { SourcePluginStudioOutput as StudioOutput } from '../model/use-source-plugin-studio-workbench';
import { PluginCodeEditor } from './PluginCodeEditor';
import { PluginStudioOutput } from './PluginStudioOutput';
import { PluginStudioOutputResizeHandle } from './PluginStudioOutputResizeHandle';

export function PluginStudioEditorPane({
  projectId,
  path,
  value,
  onChange,
  revealLocation,
  output,
  error,
  activeAction
}: {
  projectId: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  revealLocation?: { line: number; column: number; token: number };
  output: StudioOutput;
  error?: unknown;
  activeAction?: string;
}) {
  const { t } = useI18n();
  const hasDetails = Boolean(activeAction || error || output.titleKey !== 'pluginStudio.output');
  const [outputOpen, setOutputOpen] = useState(hasDetails);
  const [outputHeight, setOutputHeight] = useState(220);
  const [outputCleared, setOutputCleared] = useState(false);

  useEffect(() => {
    if (hasDetails) {
      setOutputOpen(true);
      setOutputCleared(false);
    }
  }, [activeAction, error, hasDetails, output.titleKey, output.value]);

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-surface">
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-surface2 px-3 py-2">
        <Text
          variant="caption"
          tone="muted"
          className="shrink-0 font-semibold uppercase tracking-wide"
        >
          {t('pluginStudio.activeFile')}
        </Text>
        <Text variant="metadata" truncate className="min-w-0 font-mono" title={path}>
          {path}
        </Text>
      </header>

      <div className="min-h-0">
        <PluginCodeEditor
          projectId={projectId}
          path={path}
          value={value}
          onChange={onChange}
          revealLocation={revealLocation}
        />
      </div>

      <div
        data-studio-output-dock
        className="min-h-0 border-t border-border bg-surface2"
        style={{
          height: outputOpen ? outputHeight : '2.75rem',
          maxHeight: outputOpen ? '45%' : undefined
        }}
      >
        {outputOpen ? (
          <PluginStudioOutputResizeHandle
            label={t('pluginStudio.resizeOutput')}
            onResize={(delta) =>
              setOutputHeight((current) => Math.min(420, Math.max(120, current + delta)))
            }
          />
        ) : null}
        <div className="h-full">
          <PluginStudioOutput
            output={output}
            error={error}
            activeAction={activeAction}
            open={outputOpen}
            cleared={outputCleared}
            onToggle={() => setOutputOpen((current) => !current)}
            onClear={() => setOutputCleared(true)}
          />
        </div>
      </div>
    </section>
  );
}
