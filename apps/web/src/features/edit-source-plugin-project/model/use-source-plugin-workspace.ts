import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getSourcePluginProject,
  type SourcePluginProject
} from '../../../entities/source-plugin-project';
import { ApiError } from '../../../shared/api';
import { updateSourcePluginProject } from '../api/update-source-plugin-project';
import {
  createSourcePluginWorkspaceController,
  hasUnsavedSourcePluginWorkspaceChanges
} from './source-plugin-workspace-controller';

export function useSourcePluginWorkspace(initialProject: SourcePluginProject) {
  const saveRef = useRef(updateSourcePluginProject);
  saveRef.current = updateSourcePluginProject;
  const [controller] = useState(() =>
    createSourcePluginWorkspaceController({
      project: initialProject,
      save: ({ projectId, ...patch }) => saveRef.current(projectId, patch),
      isConflict: (error) => error instanceof ApiError && error.status === 409
    })
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(
    () => () => {
      void controller.flush().catch(() => undefined);
    },
    [controller]
  );

  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedSourcePluginWorkspaceChanges(controller.getSnapshot().status)) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [controller]);

  return {
    ...snapshot,
    selectFile: controller.selectFile,
    updateFile: controller.updateFile,
    flush: controller.flush,
    pauseAutosave: controller.pauseAutosave,
    applyBuild: controller.applyBuild,
    replaceProject: controller.replaceProject,
    reloadFromServer: async () => {
      const project = await getSourcePluginProject(controller.getSnapshot().project.id);
      controller.replaceProject(project);
      return project;
    }
  };
}
