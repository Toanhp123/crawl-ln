import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useI18n } from '../../../../../shared/i18n';
import { Text } from '../../../../../shared/ui';
import type { SourcePluginStudioOutput as StudioOutput } from '../../../model/use-source-plugin-studio-workbench';
import { PluginCodeEditor } from './PluginCodeEditor';
import { PluginStudioOutput } from './PluginStudioOutput';

const OUTPUT_KEYBOARD_STEP = 24;

function PluginStudioOutputResizeHandle({
  label,
  onResize
}: {
  label: string;
  onResize: (delta: number) => void;
}) {
  const pointerRef = useRef<{ id: number; clientY: number } | null>(null);

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, clientY: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = pointer.clientY - event.clientY;
    if (delta === 0) return;
    pointer.clientY = event.clientY;
    onResize(delta);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onResize(OUTPUT_KEYBOARD_STEP);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onResize(-OUTPUT_KEYBOARD_STEP);
    }
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      tabIndex={0}
      className="group relative z-10 hidden h-1.5 w-full touch-none cursor-row-resize outline-none md:block"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onKeyDown={handleKeyDown}
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
    </div>
  );
}

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
    <section
      className="grid h-full min-h-0 bg-surface"
      style={{
        gridTemplateRows: `auto minmax(0, 1fr) ${
          outputOpen ? `min(max(7.5rem, 38svh), ${outputHeight}px)` : '2.75rem'
        }`
      }}
    >
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
        className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-t border-border bg-surface2"
      >
        {outputOpen ? (
          <PluginStudioOutputResizeHandle
            label={t('pluginStudio.resizeOutput')}
            onResize={(delta) =>
              setOutputHeight((current) => Math.min(420, Math.max(120, current + delta)))
            }
          />
        ) : null}
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
    </section>
  );
}
