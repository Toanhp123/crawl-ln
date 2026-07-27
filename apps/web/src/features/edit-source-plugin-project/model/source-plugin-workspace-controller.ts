import {
  parseSourcePluginStudioManifest,
  type SourcePluginProject,
  type SourcePluginStudioCapability
} from '../../../entities/source-plugin-project';
import {
  createSourcePluginStudioFile,
  deleteSourcePluginStudioFile,
  duplicateSourcePluginStudioFile,
  renameSourcePluginStudioFile
} from './source-plugin-workspace-files';

export type SourcePluginWorkspaceStatus =
  'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

export interface SourcePluginWorkspaceSnapshot {
  project: SourcePluginProject;
  selectedFile: string;
  status: SourcePluginWorkspaceStatus;
  error?: unknown;
}

export interface SaveSourcePluginWorkspaceInput {
  projectId: string;
  expectedRevision: number;
  name?: string;
  pluginId?: string;
  version?: string;
  hosts?: string[];
  capabilities?: SourcePluginStudioCapability[];
  files: Record<string, string>;
}

export interface SourcePluginWorkspaceBuildUpdate {
  checksum: string;
  revision: number;
  stale: boolean;
}

export interface SourcePluginWorkspaceScheduler {
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}

export function hasUnsavedSourcePluginWorkspaceChanges(status: SourcePluginWorkspaceStatus) {
  return status !== 'clean' && status !== 'saved';
}

const defaultScheduler: SourcePluginWorkspaceScheduler = {
  schedule: (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export function createSourcePluginWorkspaceController({
  project,
  save,
  isConflict = () => false,
  debounceMs = 650,
  scheduler = defaultScheduler
}: {
  project: SourcePluginProject;
  save: (input: SaveSourcePluginWorkspaceInput) => Promise<SourcePluginProject>;
  isConflict?: (error: unknown) => boolean;
  debounceMs?: number;
  scheduler?: SourcePluginWorkspaceScheduler;
}) {
  let snapshot: SourcePluginWorkspaceSnapshot = {
    project,
    selectedFile:
      (Object.hasOwn(project.files, 'src/index.ts')
        ? 'src/index.ts'
        : Object.keys(project.files).sort()[0]) ?? '',
    status: 'clean',
    error: undefined
  };
  let editVersion = 0;
  let savedVersion = 0;
  let saveQueue = Promise.resolve(project);
  let pendingTimer: unknown;
  let autosaveBlocked = false;
  let autosavePauseDepth = 0;
  const listeners = new Set<() => void>();

  const setSnapshot = (next: SourcePluginWorkspaceSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const cancelPendingSave = () => {
    if (pendingTimer === undefined) return;
    scheduler.cancel(pendingTimer);
    pendingTimer = undefined;
  };

  const scheduleSave = () => {
    cancelPendingSave();
    if (autosavePauseDepth > 0) return;
    pendingTimer = scheduler.schedule(() => {
      pendingTimer = undefined;
      void flush().catch(() => undefined);
    }, debounceMs);
  };

  const saveDirtyFiles = async () => {
    if (editVersion === savedVersion) return snapshot.project;

    const versionAtStart = editVersion;
    const files = { ...snapshot.project.files };
    const expectedRevision = snapshot.project.revision;
    const manifest = parseSourcePluginStudioManifest(files['manifest.json'] ?? '');
    setSnapshot({ ...snapshot, status: 'saving', error: undefined });

    try {
      const saved = await save({
        projectId: snapshot.project.id,
        expectedRevision,
        ...(manifest.valid && manifest.metadata ? manifest.metadata : {}),
        files
      });
      savedVersion = versionAtStart;
      setSnapshot(
        editVersion === versionAtStart
          ? { ...snapshot, project: saved, status: 'saved', error: undefined }
          : {
              ...snapshot,
              project: { ...saved, files: snapshot.project.files },
              status: 'dirty',
              error: undefined
            }
      );
      return snapshot.project;
    } catch (error) {
      autosaveBlocked = isConflict(error);
      setSnapshot({ ...snapshot, status: autosaveBlocked ? 'conflict' : 'error', error });
      throw error;
    }
  };

  const flush = () => {
    cancelPendingSave();
    if (autosaveBlocked) return Promise.reject(snapshot.error);
    saveQueue = saveQueue
      .catch((error) => {
        if (autosaveBlocked) throw error;
        return snapshot.project;
      })
      .then(() => {
        if (autosaveBlocked) throw snapshot.error;
        return saveDirtyFiles();
      });
    return saveQueue;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectFile(path: string) {
      if (!(path in snapshot.project.files) || path === snapshot.selectedFile) return;
      setSnapshot({ ...snapshot, selectedFile: path });
    },
    updateFile(path: string, content: string) {
      editVersion += 1;
      setSnapshot({
        ...snapshot,
        project: {
          ...snapshot.project,
          files: { ...snapshot.project.files, [path]: content }
        },
        status: autosaveBlocked ? 'conflict' : 'dirty',
        error: autosaveBlocked ? snapshot.error : undefined
      });
      if (!autosaveBlocked) scheduleSave();
    },
    createFile(path: string) {
      const files = createSourcePluginStudioFile(snapshot.project.files, path);
      editVersion += 1;
      setSnapshot({
        ...snapshot,
        project: { ...snapshot.project, files },
        selectedFile: path.trim(),
        status: autosaveBlocked ? 'conflict' : 'dirty',
        error: autosaveBlocked ? snapshot.error : undefined
      });
      if (!autosaveBlocked) scheduleSave();
    },
    renameFile(currentPath: string, nextPath: string) {
      const validatedPath = nextPath.trim();
      const files = renameSourcePluginStudioFile(
        snapshot.project.files,
        currentPath,
        validatedPath
      );
      if (files === snapshot.project.files) return;
      editVersion += 1;
      setSnapshot({
        ...snapshot,
        project: { ...snapshot.project, files },
        selectedFile: snapshot.selectedFile === currentPath ? validatedPath : snapshot.selectedFile,
        status: autosaveBlocked ? 'conflict' : 'dirty',
        error: autosaveBlocked ? snapshot.error : undefined
      });
      if (!autosaveBlocked) scheduleSave();
    },
    duplicateFile(path: string) {
      const duplicated = duplicateSourcePluginStudioFile(snapshot.project.files, path);
      editVersion += 1;
      setSnapshot({
        ...snapshot,
        project: { ...snapshot.project, files: duplicated.files },
        selectedFile: duplicated.path,
        status: autosaveBlocked ? 'conflict' : 'dirty',
        error: autosaveBlocked ? snapshot.error : undefined
      });
      if (!autosaveBlocked) scheduleSave();
      return duplicated.path;
    },
    deleteFile(path: string) {
      const files = deleteSourcePluginStudioFile(snapshot.project.files, path);
      const remaining = Object.keys(files).sort();
      editVersion += 1;
      setSnapshot({
        ...snapshot,
        project: { ...snapshot.project, files },
        selectedFile:
          snapshot.selectedFile === path
            ? ((Object.hasOwn(files, 'src/index.ts') ? 'src/index.ts' : remaining[0]) ?? '')
            : snapshot.selectedFile,
        status: autosaveBlocked ? 'conflict' : 'dirty',
        error: autosaveBlocked ? snapshot.error : undefined
      });
      if (!autosaveBlocked) scheduleSave();
    },
    pauseAutosave() {
      cancelPendingSave();
      autosavePauseDepth += 1;
      let resumed = false;
      return () => {
        if (resumed) return;
        resumed = true;
        autosavePauseDepth = Math.max(0, autosavePauseDepth - 1);
        if (autosavePauseDepth === 0 && !autosaveBlocked && editVersion !== savedVersion) {
          scheduleSave();
        }
      };
    },
    applyBuild(build: SourcePluginWorkspaceBuildUpdate) {
      setSnapshot({
        ...snapshot,
        project: {
          ...snapshot.project,
          build: {
            checksum: build.checksum,
            revision: build.revision,
            stale:
              build.stale ||
              editVersion !== savedVersion ||
              snapshot.project.revision !== build.revision
          }
        }
      });
    },
    replaceProject(nextProject: SourcePluginProject) {
      cancelPendingSave();
      autosaveBlocked = false;
      editVersion = 0;
      savedVersion = 0;
      saveQueue = Promise.resolve(nextProject);
      const selectedFile = Object.hasOwn(nextProject.files, snapshot.selectedFile)
        ? snapshot.selectedFile
        : ((Object.hasOwn(nextProject.files, 'src/index.ts')
            ? 'src/index.ts'
            : Object.keys(nextProject.files).sort()[0]) ?? '');
      setSnapshot({
        project: nextProject,
        selectedFile,
        status: 'clean',
        error: undefined
      });
    },
    flush
  };
}
