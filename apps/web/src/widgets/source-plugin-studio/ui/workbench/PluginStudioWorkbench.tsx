import { useMemo, useState } from 'react';
import type { SourcePluginProject } from '../../../../entities/source-plugin-project';
import { useI18n } from '../../../../shared/i18n';
import { Button, ErrorBanner, InlineNotice } from '../../../../shared/ui';
import { useSourcePluginStudioWorkbench } from '../../model/use-source-plugin-studio-workbench';
import { useSourcePluginStudioDiagnostics } from '../../model/use-source-plugin-studio-diagnostics';
import type { PluginStudioPanel } from '../../model/source-plugin-studio-layout';
import {
  summarizeSourcePluginStudioDiagnosticsByPath,
  type SourcePluginStudioDiagnostic
} from '../../model/source-plugin-studio-diagnostics';
import { PluginStudioEditorPane } from './editor/PluginStudioEditorPane';
import { PluginStudioExplorer } from './PluginStudioExplorer';
import { PluginStudioInspector } from './inspector/PluginStudioInspector';
import { PluginStudioToolbar } from './PluginStudioToolbar';
import { PluginStudioWorkspace } from './PluginStudioWorkspace';

export function PluginStudioWorkbench({
  project,
  onClose
}: {
  project: SourcePluginProject;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const model = useSourcePluginStudioWorkbench(project, onClose);
  const files = Object.keys(model.workspace.project.files).sort();
  const selectedContent = model.workspace.project.files[model.workspace.selectedFile] ?? '';
  const [diagnosticLocation, setDiagnosticLocation] = useState<
    { line: number; column: number; token: number } | undefined
  >();
  const diagnostics = useSourcePluginStudioDiagnostics(
    model.workspace.project.id,
    model.workspace.project.files
  );
  const diagnosticsByPath = useMemo(
    () => summarizeSourcePluginStudioDiagnosticsByPath(diagnostics.diagnostics),
    [diagnostics.diagnostics]
  );

  const [activePanel, setActivePanel] = useState<PluginStudioPanel>('editor');
  const disabled = model.busy || model.workspace.status === 'conflict';
  const openManifest = () => {
    model.workspace.selectFile('manifest.json');
    setActivePanel('editor');
  };
  const openDiagnostic = (diagnostic: SourcePluginStudioDiagnostic) => {
    model.workspace.selectFile(diagnostic.path);
    setDiagnosticLocation({
      line: diagnostic.line,
      column: diagnostic.column,
      token: Date.now()
    });
    setActivePanel('editor');
  };
  const inspectorProps = {
    projectId: model.workspace.project.id,
    manifestSource: model.workspace.project.files['manifest.json'] ?? '',
    manifest: model.manifest,
    disabled,
    diagnostics: diagnostics.diagnostics,
    diagnosticSummary: diagnostics.summary,
    onManifestChange: (source: string) => model.workspace.updateFile('manifest.json', source),
    onOpenManifest: openManifest,
    onOpenDiagnostic: openDiagnostic
  };
  const notice =
    model.workspace.status === 'conflict' ? (
      <div className="border-b border-border bg-surface p-3">
        <InlineNotice
          tone="warning"
          title={t('editSourcePluginProject.conflictTitle')}
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={model.reloading}
              onClick={() => void model.reloadFromServer()}
            >
              {t('editSourcePluginProject.reload')}
            </Button>
          }
        >
          {t('editSourcePluginProject.conflictDescription')}
        </InlineNotice>
      </div>
    ) : model.workspace.status === 'error' ? (
      <div className="border-b border-border bg-surface p-3">
        <ErrorBanner error={model.workspace.error} />
      </div>
    ) : undefined;

  return (
    <PluginStudioWorkspace
      activePanel={activePanel}
      onActivePanelChange={setActivePanel}
      diagnosticSummary={diagnostics.summary}
      activityBarLabel={t('pluginStudio.activityBar')}
      activityLabels={{
        files: t('pluginStudio.fileExplorer'),
        metadata: t('pluginStudio.metadataTab'),
        diagnostics: t('pluginStudio.diagnosticsTab')
      }}
      resizeSidebarLabel={t('pluginStudio.resizeSidebar')}
      toolbar={
        <PluginStudioToolbar
          project={model.workspace.project}
          manifest={model.manifest}
          workspaceStatus={model.workspace.status}
          buildCurrent={model.buildCurrent}
          busy={model.busy}
          buildState={model.buildState}
          testState={model.testState}
          exportState={model.exportState}
          installState={model.installState}
          closeState={model.closeState}
          diagnosticSummary={diagnostics.summary}
          onClose={() => void model.closeProject()}
          onBuild={() => void model.runBuild()}
          onTest={() => void model.runTest()}
          onExport={() => void model.runExport()}
          onInstall={() => void model.runInstall()}
        />
      }
      notice={notice}
      filesSidebar={
        <PluginStudioExplorer
          files={files}
          selectedFile={model.workspace.selectedFile}
          disabled={disabled}
          diagnosticsByPath={diagnosticsByPath}
          onSelect={(path) => {
            model.workspace.selectFile(path);
            setActivePanel('editor');
          }}
          onCreateFile={(path) => {
            model.workspace.createFile(path);
            setActivePanel('editor');
          }}
          onCreateFolder={(path) => {
            model.workspace.createFile(path);
            setActivePanel('editor');
          }}
          onRename={(currentPath, nextPath) => {
            model.workspace.renameFile(currentPath, nextPath);
            setActivePanel('editor');
          }}
          onDuplicate={(path) => {
            model.workspace.duplicateFile(path);
            setActivePanel('editor');
          }}
          onDelete={model.workspace.deleteFile}
        />
      }
      metadataSidebar={
        <PluginStudioInspector {...inspectorProps} activeTab="metadata" variant="panel" />
      }
      diagnosticsSidebar={
        <PluginStudioInspector {...inspectorProps} activeTab="diagnostics" variant="panel" />
      }
      editor={
        <PluginStudioEditorPane
          projectId={model.workspace.project.id}
          path={model.workspace.selectedFile}
          value={selectedContent}
          onChange={(value) => model.workspace.updateFile(model.workspace.selectedFile, value)}
          revealLocation={diagnosticLocation}
          output={model.output}
          error={model.actionError}
          activeAction={model.activeAction}
        />
      }
      inspector={<PluginStudioInspector {...inspectorProps} />}
    />
  );
}
