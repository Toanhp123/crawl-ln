import { useState } from 'react';
import type { SourcePluginStudioManifestState } from '../../../../../entities/source-plugin-project';
import { useI18n } from '../../../../../shared/i18n';
import { Text } from '../../../../../shared/ui';
import type {
  SourcePluginStudioDiagnostic,
  SourcePluginStudioDiagnosticSummary
} from '../../../model/source-plugin-studio-diagnostics';
import type { PluginStudioInspectorTab } from '../../../model/source-plugin-studio-layout';
import { PluginStudioDiagnostics } from './PluginStudioDiagnostics';
import { PluginStudioManifestEditor } from './PluginStudioManifestEditor';

export function PluginStudioInspector({
  projectId,
  activeTab: panelTab,
  manifestSource,
  manifest,
  disabled,
  diagnostics,
  diagnosticSummary,
  variant = 'tabs',
  onManifestChange,
  onOpenManifest,
  onOpenDiagnostic
}: {
  projectId: string;
  activeTab?: PluginStudioInspectorTab;
  manifestSource: string;
  manifest: SourcePluginStudioManifestState;
  disabled: boolean;
  diagnostics: SourcePluginStudioDiagnostic[];
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
  variant?: 'tabs' | 'panel';
  onManifestChange: (source: string) => void;
  onOpenManifest: () => void;
  onOpenDiagnostic: (diagnostic: SourcePluginStudioDiagnostic) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<PluginStudioInspectorTab>('metadata');
  const activeTab = variant === 'panel' ? (panelTab ?? 'metadata') : tab;
  const metadataTabId = `studio-${projectId}-metadata-tab`;
  const metadataPanelId = `studio-${projectId}-metadata-panel`;
  const diagnosticsTabId = `studio-${projectId}-diagnostics-tab`;
  const diagnosticsPanelId = `studio-${projectId}-diagnostics-panel`;

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      {variant === 'tabs' ? (
        <div
          role="tablist"
          aria-label={t('pluginStudio.projectDetails')}
          className="grid grid-cols-2 items-center border-b border-border bg-surface2 p-1"
        >
          <button
            id={metadataTabId}
            type="button"
            role="tab"
            aria-selected={activeTab === 'metadata'}
            aria-controls={metadataPanelId}
            className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
            onClick={() => setTab('metadata')}
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
            onClick={() => setTab('diagnostics')}
          >
            {t('pluginStudio.diagnosticsTab')} ({diagnosticSummary.total})
          </button>
        </div>
      ) : (
        <header className="flex min-h-11 items-center border-b border-border px-3">
          <Text as="h2" variant="titleSm">
            {activeTab === 'metadata'
              ? t('pluginStudio.metadataTab')
              : `${t('pluginStudio.diagnosticsTab')} (${diagnosticSummary.total})`}
          </Text>
        </header>
      )}

      <div
        id={metadataPanelId}
        role={variant === 'tabs' ? 'tabpanel' : undefined}
        aria-labelledby={variant === 'tabs' ? metadataTabId : undefined}
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
        role={variant === 'tabs' ? 'tabpanel' : undefined}
        aria-labelledby={variant === 'tabs' ? diagnosticsTabId : undefined}
        hidden={activeTab !== 'diagnostics'}
        className="min-h-0 overflow-auto"
      >
        <PluginStudioDiagnostics diagnostics={diagnostics} onOpen={onOpenDiagnostic} />
      </div>
    </section>
  );
}
