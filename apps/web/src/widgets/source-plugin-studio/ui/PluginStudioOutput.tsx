import { useI18n } from '../../../shared/i18n';
import { Panel, Text } from '../../../shared/ui';
import type { SourcePluginStudioOutput } from '../model/use-source-plugin-studio-workbench';

function printable(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function PluginStudioOutput({
  output,
  error,
  activeAction
}: {
  output: SourcePluginStudioOutput;
  error?: unknown;
  activeAction?: string;
}) {
  const { t, errorMessage } = useI18n();
  return (
    <Panel
      tone="inset"
      padding="sm"
      className="min-h-0 overflow-auto rounded-none border-x-0 border-b-0"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <Text variant="caption" tone="muted" className="font-bold uppercase">
          {t(output.titleKey)}
        </Text>
        {activeAction ? (
          <Text variant="caption" tone="primary">
            {t(activeAction)}...
          </Text>
        ) : null}
      </div>
      <pre
        className={
          error
            ? 'whitespace-pre-wrap font-mono text-xs leading-5 text-danger'
            : 'whitespace-pre-wrap font-mono text-xs leading-5 text-secondary'
        }
      >
        {error ? errorMessage(error) : printable(output.value)}
      </pre>
    </Panel>
  );
}
