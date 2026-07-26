import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, InlineNotice, Surface } from '../../../shared/ui';
import { useSourcePluginStudioWorkbench } from '../model/use-source-plugin-studio-workbench';
import { PluginCodeEditor } from './PluginCodeEditor';
import { PluginProjectFileTree } from './PluginProjectFileTree';
import { PluginStudioOutput } from './PluginStudioOutput';
import { PluginStudioToolbar } from './PluginStudioToolbar';

export function PluginStudioWorkbench({ project }: { project: SourcePluginProject }) {
  const { t } = useI18n();
  const model = useSourcePluginStudioWorkbench(project);
  const files = Object.keys(model.workspace.project.files).sort();
  const selectedContent = model.workspace.project.files[model.workspace.selectedFile] ?? '';

  return (
    <Surface className="overflow-hidden shadow-[var(--elevation-2)]">
      <PluginStudioToolbar
        project={model.workspace.project}
        workspaceStatus={model.workspace.status}
        buildCurrent={model.buildCurrent}
        busy={model.busy}
        buildState={model.buildState}
        testState={model.testState}
        exportState={model.exportState}
        installState={model.installState}
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
          onSelect={model.workspace.selectFile}
        />
        <div className="grid min-h-0 grid-rows-[minmax(28rem,1fr)_minmax(10rem,auto)]">
          <PluginCodeEditor
            path={model.workspace.selectedFile}
            value={selectedContent}
            onChange={(value) => model.workspace.updateFile(model.workspace.selectedFile, value)}
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
