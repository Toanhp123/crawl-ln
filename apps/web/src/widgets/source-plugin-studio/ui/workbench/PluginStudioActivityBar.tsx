import { Database, Files, TriangleAlert } from 'lucide-react';
import { cn } from '../../../../shared/lib/cn';
import { IconButton } from '../../../../shared/ui';
import type { SourcePluginStudioDiagnosticSummary } from '../../model/source-plugin-studio-diagnostics';
import type { PluginStudioActivityPanel } from '../../model/source-plugin-studio-layout';

const tools = [
  { id: 'files', icon: Files },
  { id: 'metadata', icon: Database },
  { id: 'diagnostics', icon: TriangleAlert }
] as const;

export function PluginStudioActivityBar({
  activePanel,
  onChange,
  diagnosticSummary,
  label,
  labels
}: {
  activePanel: PluginStudioActivityPanel | null;
  onChange: (panel: PluginStudioActivityPanel) => void;
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
  label: string;
  labels: Record<PluginStudioActivityPanel, string>;
}) {
  return (
    <nav
      role="tablist"
      aria-label={label}
      data-studio-activity-bar=""
      className="flex h-full flex-col items-center gap-1 border-r border-border bg-surface2 px-1 py-2"
    >
      {tools.map(({ id, icon: Icon }) => {
        const selected = activePanel === id;
        const diagnosticCount = id === 'diagnostics' ? diagnosticSummary.total : 0;
        return (
          <div key={id} className="relative">
            <IconButton
              id={`studio-activity-${id}-tab`}
              role="tab"
              variant="ghost"
              aria-selected={selected}
              aria-controls={`studio-activity-${id}-panel`}
              aria-label={labels[id]}
              title={labels[id]}
              className={cn(
                'border-transparent bg-transparent text-muted hover:bg-transparent',
                selected ? 'text-primary hover:text-primary' : 'hover:text-text'
              )}
              onClick={() => onChange(id)}
            >
              <Icon size={19} aria-hidden="true" />
            </IconButton>
            {diagnosticCount > 0 ? (
              <span className="pointer-events-none absolute right-0 top-0 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                {diagnosticCount}
              </span>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
