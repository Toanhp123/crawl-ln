import { useState } from 'react';
import {
  parseSourcePluginStudioManifest,
  type SourcePluginProject
} from '../../../entities/source-plugin-project';
import { useBuildSourcePluginProject } from '../../../features/build-source-plugin-project';
import { useExportSourcePluginProject } from '../../../features/export-source-plugin-project';
import { useInstallSourcePluginProject } from '../../../features/install-source-plugin-project';
import { useTestSourcePluginProject } from '../../../features/test-source-plugin-project';
import { useSourcePluginWorkspace } from '../../../features/edit-source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import {
  runSourcePluginStudioAction,
  runSourcePluginStudioBuild,
  runSourcePluginStudioClose
} from './workbench-operations';

export interface SourcePluginStudioOutput {
  titleKey: string;
  value: unknown;
}

export function useSourcePluginStudioWorkbench(
  initialProject: SourcePluginProject,
  onClose: () => void
) {
  const { t } = useI18n();
  const workspace = useSourcePluginWorkspace(initialProject);
  const build = useBuildSourcePluginProject();
  const test = useTestSourcePluginProject();
  const exportProject = useExportSourcePluginProject();
  const install = useInstallSourcePluginProject();
  const [activeAction, setActiveAction] = useState<string>();
  const [actionError, setActionError] = useState<unknown>();
  const [output, setOutput] = useState<SourcePluginStudioOutput>({
    titleKey: 'pluginStudio.output',
    value: t('pluginStudio.ready')
  });
  const [reloading, setReloading] = useState(false);
  const manifest = parseSourcePluginStudioManifest(workspace.project.files['manifest.json'] ?? '');

  const requireValidManifest = () => {
    if (!manifest.valid) throw new Error(manifest.error ?? 'manifest.json is invalid');
  };

  const execute = async <T>(titleKey: string, operation: () => Promise<T>) => {
    setActiveAction(titleKey);
    setActionError(undefined);
    setOutput((current) => ({ ...current, titleKey }));
    try {
      const result = await operation();
      setOutput({ titleKey, value: result });
      return result;
    } catch (error) {
      setActionError(error);
      return undefined;
    } finally {
      setActiveAction(undefined);
    }
  };

  const runBuild = () =>
    execute('buildSourcePluginProject.action', () => {
      requireValidManifest();
      return runSourcePluginStudioBuild({
        pauseAutosave: workspace.pauseAutosave,
        flush: workspace.flush,
        build: (project) => build.mutateAsync(project.id),
        applyBuild: workspace.applyBuild
      });
    });

  const runTest = () =>
    execute('testSourcePluginProject.action', () => {
      requireValidManifest();
      return runSourcePluginStudioAction({
        flush: workspace.flush,
        action: (project) => test.mutateAsync(project.id)
      });
    });

  const runExport = () =>
    execute('exportSourcePluginProject.action', async () => {
      requireValidManifest();
      const artifact = await runSourcePluginStudioAction({
        flush: workspace.flush,
        action: (project) => exportProject.mutateAsync(project.id)
      });
      return { filename: artifact.filename, bytes: artifact.content.byteLength };
    });

  const runInstall = () =>
    execute('installSourcePluginProject.action', () => {
      requireValidManifest();
      return runSourcePluginStudioAction({
        flush: workspace.flush,
        action: (project) => install.mutateAsync(project.id)
      });
    });

  const closeProject = () =>
    execute('pluginStudio.backToProjects', () =>
      runSourcePluginStudioClose({ flush: workspace.flush, close: onClose })
    );

  const reloadFromServer = async () => {
    setReloading(true);
    setActionError(undefined);
    try {
      await workspace.reloadFromServer();
    } catch (error) {
      setActionError(error);
    } finally {
      setReloading(false);
    }
  };

  const draftClean = workspace.status === 'clean' || workspace.status === 'saved';
  const buildCurrent = Boolean(
    draftClean &&
    workspace.project.build &&
    !workspace.project.build.stale &&
    workspace.project.build.revision === workspace.project.revision
  );

  return {
    workspace,
    manifest,
    output,
    actionError,
    activeAction,
    reloading,
    buildCurrent: buildCurrent && manifest.valid,
    busy: Boolean(activeAction) || workspace.status === 'saving' || reloading,
    buildState: build.status,
    testState: test.status,
    exportState: exportProject.status,
    installState: install.status,
    closeState:
      activeAction === 'pluginStudio.backToProjects' ? ('pending' as const) : ('idle' as const),
    runBuild,
    runTest,
    runExport,
    runInstall,
    closeProject,
    reloadFromServer
  };
}
