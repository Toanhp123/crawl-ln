import { Code2, Files, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n';
import { cn } from '../../../../shared/lib/cn';
import type { SourcePluginStudioDiagnosticSummary } from '../../model/source-plugin-studio-diagnostics';
import type { PluginStudioPanel } from '../../model/source-plugin-studio-layout';

const panels = [
  { id: 'files', labelKey: 'pluginStudio.filesPanel', icon: Files },
  { id: 'editor', labelKey: 'pluginStudio.editorPanel', icon: Code2 },
  { id: 'details', labelKey: 'pluginStudio.detailsPanel', icon: SlidersHorizontal }
] as const;

export function PluginStudioMobilePanelNav({
  activePanel,
  onChange,
  diagnosticSummary
}: {
  activePanel: PluginStudioPanel;
  onChange: (panel: PluginStudioPanel) => void;
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
}) {
  const { t } = useI18n();

  return (
    <div
      role="tablist"
      aria-label={t('pluginStudio.workspacePanels')}
      className="grid shrink-0 grid-cols-3 gap-1 border-b border-border bg-surface2 p-1 md:px-2"
      data-studio-panel-nav=""
    >
      {panels.map(({ id, labelKey, icon: Icon }) => {
        const selected = activePanel === id;
        const diagnosticCount = id === 'details' ? diagnosticSummary.total : 0;
        return (
          <button
            key={id}
            id={`studio-${id}-tab`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`studio-${id}-panel`}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex min-h-[var(--control-touch-min)] min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2 py-2 text-sm font-semibold text-secondary transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              selected && 'bg-surface text-primary shadow-sm'
            )}
          >
            <Icon size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{t(labelKey)}</span>
            {diagnosticCount > 0 ? (
              <span
                className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-danger-subtle px-1.5 text-xs font-bold text-danger"
                aria-label={t('pluginStudio.diagnosticCount', { count: diagnosticCount })}
              >
                {diagnosticCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
