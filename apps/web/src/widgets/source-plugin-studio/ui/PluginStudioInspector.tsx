import type { SourcePluginStudioManifestState } from '../../../entities/source-plugin-project';
import { PanelRightClose } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { IconButton } from '../../../shared/ui';
import type {
  SourcePluginStudioDiagnostic,
  SourcePluginStudioDiagnosticSummary
} from '../model/source-plugin-studio-diagnostics';
import { PluginStudioDiagnostics } from './PluginStudioDiagnostics';
import { PluginStudioManifestEditor } from './PluginStudioManifestEditor';

export type PluginStudioInspectorTab = 'metadata' | 'diagnostics';

export function PluginStudioInspector({
  projectId,
  activeTab,
  onTabChange,
  manifestSource,
  manifest,
  disabled,
  diagnostics,
  diagnosticSummary,
  collapseLabel,
  onCollapse,
  onManifestChange,
  onOpenManifest,
  onOpenDiagnostic
}: {
  projectId: string;
  activeTab: PluginStudioInspectorTab;
  onTabChange: (tab: PluginStudioInspectorTab) => void;
  manifestSource: string;
  manifest: SourcePluginStudioManifestState;
  disabled: boolean;
  diagnostics: SourcePluginStudioDiagnostic[];
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
  collapseLabel: string;
  onCollapse: () => void;
  onManifestChange: (source: string) => void;
  onOpenManifest: () => void;
  onOpenDiagnostic: (diagnostic: SourcePluginStudioDiagnostic) => void;
}) {
  const { t } = useI18n();
  const metadataTabId = `studio-${projectId}-metadata-tab`;
  const metadataPanelId = `studio-${projectId}-metadata-panel`;
  const diagnosticsTabId = `studio-${projectId}-diagnostics-tab`;
  const diagnosticsPanelId = `studio-${projectId}-diagnostics-panel`;

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-label={t('pluginStudio.projectDetails')}
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center border-b border-border bg-surface2 p-1"
      >
        <button
          id={metadataTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === 'metadata'}
          aria-controls={metadataPanelId}
          className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          onClick={() => onTabChange('metadata')}
        >
          {t('pluginStudio.metadataTab')}
        </button>
        <button
          id={diagnosticsTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === 'diagnostics'}
          aria-controls={diagnosticsPanelId}
          className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          onClick={() => onTabChange('diagnostics')}
        >
          {t('pluginStudio.diagnosticsTab')} ({diagnosticSummary.total})
        </button>
        <IconButton
          variant="ghost"
          className="hidden h-8 w-8 lg:inline-flex"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={onCollapse}
        >
          <PanelRightClose size={16} aria-hidden="true" />
        </IconButton>
      </div>

      <div
        id={metadataPanelId}
        role="tabpanel"
        aria-labelledby={metadataTabId}
        hidden={activeTab !== 'metadata'}
        className="min-h-0 overflow-auto"
      >
        <PluginStudioManifestEditor
          source={manifestSource}
          state={manifest}
          disabled={disabled}
          onChange={onManifestChange}
          onOpenManifest={onOpenManifest}
        />
      </div>
      <div
        id={diagnosticsPanelId}
        role="tabpanel"
        aria-labelledby={diagnosticsTabId}
        hidden={activeTab !== 'diagnostics'}
        className="min-h-0 overflow-auto"
      >
        <PluginStudioDiagnostics diagnostics={diagnostics} onOpen={onOpenDiagnostic} />
      </div>
    </section>
  );
}
