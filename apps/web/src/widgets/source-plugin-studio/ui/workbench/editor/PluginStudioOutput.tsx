import { Check, ChevronDown, ChevronUp, Copy, SquareTerminal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../../shared/i18n';
import { IconButton, Panel, Text } from '../../../../../shared/ui';
import { sourcePluginStudioClipboardService } from '../../../model/source-plugin-studio-clipboard';
import type { SourcePluginStudioOutput } from '../../../model/use-source-plugin-studio-workbench';

function printable(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function PluginStudioOutput({
  output,
  error,
  activeAction,
  open,
  cleared,
  onToggle,
  onClear
}: {
  output: SourcePluginStudioOutput;
  error?: unknown;
  activeAction?: string;
  open: boolean;
  cleared: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const { t, errorMessage } = useI18n();
  const [copied, setCopied] = useState(false);
  const value = error ? errorMessage(error) : printable(output.value);

  const copyOutput = async () => {
    await sourcePluginStudioClipboardService.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div data-studio-output-content className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-11 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-text"
          onClick={onToggle}
          aria-expanded={open}
        >
          <SquareTerminal size={15} aria-hidden="true" />
          <span className="truncate">{t(output.titleKey)}</span>
          {activeAction ? (
            <Text variant="caption" tone="primary" className="truncate">
              {t(activeAction)}...
            </Text>
          ) : null}
          {open ? (
            <ChevronDown size={15} aria-hidden="true" />
          ) : (
            <ChevronUp size={15} aria-hidden="true" />
          )}
        </button>
        <IconButton
          variant="ghost"
          className="h-8 w-8"
          aria-label={t('pluginStudio.copyOutput')}
          title={t('pluginStudio.copyOutput')}
          onClick={() => void copyOutput()}
          disabled={!value}
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        </IconButton>
        <IconButton
          variant="ghost"
          className="h-8 w-8"
          aria-label={t('pluginStudio.clearOutput')}
          title={t('pluginStudio.clearOutput')}
          onClick={onClear}
          disabled={cleared}
        >
          <Trash2 size={15} aria-hidden="true" />
        </IconButton>
      </div>
      {open ? (
        <Panel
          tone="inset"
          padding="sm"
          className="min-h-0 flex-1 overflow-auto rounded-none border-x-0 border-b-0"
          aria-live="polite"
        >
          {cleared ? (
            <Text variant="caption" tone="muted">
              {t('pluginStudio.outputCleared')}
            </Text>
          ) : (
            <pre
              className={
                error
                  ? 'whitespace-pre-wrap font-mono text-xs leading-5 text-danger'
                  : 'whitespace-pre-wrap font-mono text-xs leading-5 text-secondary'
              }
            >
              {value}
            </pre>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
