import { AlertTriangle, CircleCheck, CircleX } from 'lucide-react';
import type { SourcePluginStudioDiagnostic } from '../../../model/source-plugin-studio-diagnostics';
import { useI18n } from '../../../../../shared/i18n';

export function PluginStudioDiagnostics({
  diagnostics,
  onOpen
}: {
  diagnostics: SourcePluginStudioDiagnostic[];
  onOpen: (diagnostic: SourcePluginStudioDiagnostic) => void;
}) {
  const { t } = useI18n();
  return (
    <section
      className="min-h-0 overflow-auto bg-surface"
      aria-label={t('pluginStudio.diagnostics')}
    >
      {diagnostics.length === 0 ? (
        <div className="grid place-items-center gap-2 p-6 text-center text-sm text-muted">
          <CircleCheck size={20} className="text-success" aria-hidden="true" />
          {t('pluginStudio.noDiagnostics')}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {diagnostics.map((diagnostic, index) => (
            <button
              key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${index}`}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2 text-left type-body-sm hover:bg-surface2 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
                <span className="block text-muted">{diagnostic.message}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
