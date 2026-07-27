import { useState } from 'react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, InlineNotice, Surface } from '../../../shared/ui';
import { useSourcePluginStudioWorkbench } from '../model/use-source-plugin-studio-workbench';
import { useSourcePluginStudioDiagnostics } from '../model/use-source-plugin-studio-diagnostics';
import { PluginCodeEditor } from './PluginCodeEditor';
import { PluginProjectFileTree } from './PluginProjectFileTree';
import { PluginStudioManifestEditor } from './PluginStudioManifestEditor';
import { PluginStudioDiagnostics } from './PluginStudioDiagnostics';
import { PluginStudioOutput } from './PluginStudioOutput';
import { PluginStudioToolbar } from './PluginStudioToolbar';

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

  return (
    <Surface className="overflow-hidden shadow-[var(--elevation-2)]">
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
      {model.workspace.status === 'conflict' ? (
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
      ) : null}
      <div className="grid min-h-[36rem] grid-cols-1 md:grid-cols-[minmax(12rem,var(--sidebar-width))_minmax(0,1fr)]">
        <PluginProjectFileTree
          files={files}
          selectedFile={model.workspace.selectedFile}
          disabled={model.busy || model.workspace.status === 'conflict'}
          onSelect={model.workspace.selectFile}
          onCreateFile={model.workspace.createFile}
          onCreateFolder={model.workspace.createFile}
          onRename={model.workspace.renameFile}
          onDuplicate={model.workspace.duplicateFile}
          onDelete={model.workspace.deleteFile}
        />
        <div className="grid min-h-0 grid-rows-[auto_minmax(28rem,1fr)_minmax(10rem,auto)]">
          <PluginStudioManifestEditor
            source={model.workspace.project.files['manifest.json'] ?? ''}
            state={model.manifest}
            disabled={model.busy || model.workspace.status === 'conflict'}
            onChange={(source) => model.workspace.updateFile('manifest.json', source)}
            onOpenManifest={() => model.workspace.selectFile('manifest.json')}
          />
          <PluginCodeEditor
            projectId={model.workspace.project.id}
            path={model.workspace.selectedFile}
            value={selectedContent}
            onChange={(value) => model.workspace.updateFile(model.workspace.selectedFile, value)}
            revealLocation={diagnosticLocation}
          />
          <PluginStudioDiagnostics
            diagnostics={diagnostics.diagnostics}
            onOpen={(diagnostic) => {
              model.workspace.selectFile(diagnostic.path);
              setDiagnosticLocation({
                line: diagnostic.line,
                column: diagnostic.column,
                token: Date.now()
              });
            }}
          />
          <PluginStudioOutput
            output={model.output}
            error={model.actionError}
            activeAction={model.activeAction}
          />
        </div>
      </div>
    </Surface>
  );
}
