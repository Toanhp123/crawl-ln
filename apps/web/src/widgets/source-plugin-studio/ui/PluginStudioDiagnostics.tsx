import { AlertTriangle, CircleX } from 'lucide-react';
import type { SourcePluginStudioDiagnostic } from '../model/source-plugin-studio-diagnostics';
import { useI18n } from '../../../shared/i18n';

export function PluginStudioDiagnostics({
  diagnostics,
  onOpen
}: {
  diagnostics: SourcePluginStudioDiagnostic[];
  onOpen: (diagnostic: SourcePluginStudioDiagnostic) => void;
}) {
  const { t } = useI18n();
  if (diagnostics.length === 0) return null;
  return (
    <section
      className="max-h-48 overflow-auto border-t border-border bg-surface"
      aria-label={t('pluginStudio.diagnostics')}
    >
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('pluginStudio.diagnostics')}
      </div>
      <div className="divide-y divide-border">
        {diagnostics.map((diagnostic, index) => (
          <button
            key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${index}`}
            type="button"
            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
            onClick={() => onOpen(diagnostic)}
          >
            {diagnostic.severity === 'error' ? (
              <CircleX className="mt-0.5 shrink-0 text-danger" size={16} />
            ) : (
              <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={16} />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {diagnostic.path}:{diagnostic.line}:{diagnostic.column}
              </span>
              <span className="block text-muted-foreground">{diagnostic.message}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
