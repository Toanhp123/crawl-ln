import { useMemo, useState } from 'react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, InlineNotice } from '../../../shared/ui';
import { useSourcePluginStudioWorkbench } from '../model/use-source-plugin-studio-workbench';
import { useSourcePluginStudioDiagnostics } from '../model/use-source-plugin-studio-diagnostics';
import type { PluginStudioPanel } from '../model/source-plugin-studio-layout';
import { summarizeSourcePluginStudioDiagnosticsByPath } from '../model/source-plugin-studio-diagnostics';
import { PluginStudioEditorPane } from './PluginStudioEditorPane';
import { PluginStudioInspector, type PluginStudioInspectorTab } from './PluginStudioInspector';
import { PluginStudioProjectSidebar } from './PluginStudioProjectSidebar';
import { PluginStudioToolbar } from './PluginStudioToolbar';
import { PluginStudioWorkspaceShell } from './PluginStudioWorkspaceShell';

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
  const [inspectorTab, setInspectorTab] = useState<PluginStudioInspectorTab>('metadata');
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const disabled = model.busy || model.workspace.status === 'conflict';
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
    <PluginStudioWorkspaceShell
      activePanel={activePanel}
      onActivePanelChange={setActivePanel}
      diagnosticSummary={diagnostics.summary}
      filesCollapsed={filesCollapsed}
      inspectorCollapsed={inspectorCollapsed}
      filesRailLabel={t('pluginStudio.fileExplorer')}
      metadataRailLabel={t('pluginStudio.metadataTab')}
      diagnosticsRailLabel={t('pluginStudio.diagnosticsTab')}
      onExpandFiles={() => setFilesCollapsed(false)}
      onExpandMetadata={() => {
        setInspectorTab('metadata');
        setInspectorCollapsed(false);
      }}
      onExpandDiagnostics={() => {
        setInspectorTab('diagnostics');
        setInspectorCollapsed(false);
      }}
      resizeFilesLabel={t('pluginStudio.resizeFiles')}
      resizeInspectorLabel={t('pluginStudio.resizeInspector')}
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
      sidebar={
        <PluginStudioProjectSidebar
          project={model.workspace.project}
          manifest={model.manifest}
          workspaceStatus={model.workspace.status}
          files={files}
          selectedFile={model.workspace.selectedFile}
          disabled={disabled}
          diagnosticsByPath={diagnosticsByPath}
          collapseLabel={t('pluginStudio.collapseFiles')}
          onCollapse={() => setFilesCollapsed(true)}
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
      inspector={
        <PluginStudioInspector
          projectId={model.workspace.project.id}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          manifestSource={model.workspace.project.files['manifest.json'] ?? ''}
          manifest={model.manifest}
          disabled={disabled}
          diagnostics={diagnostics.diagnostics}
          diagnosticSummary={diagnostics.summary}
          collapseLabel={t('pluginStudio.collapseDetails')}
          onCollapse={() => setInspectorCollapsed(true)}
          onManifestChange={(source) => model.workspace.updateFile('manifest.json', source)}
          onOpenManifest={() => {
            model.workspace.selectFile('manifest.json');
            setActivePanel('editor');
          }}
          onOpenDiagnostic={(diagnostic) => {
            model.workspace.selectFile(diagnostic.path);
            setDiagnosticLocation({
              line: diagnostic.line,
              column: diagnostic.column,
              token: Date.now()
            });
            setActivePanel('editor');
          }}
        />
      }
    />
  );
}
