import type { SourcePluginProject } from '../../../entities/source-plugin-project';

/** Coordinates persistence around actions that operate on the current draft. */
export async function runSourcePluginStudioAction<T>({
  flush,
  action
}: {
  flush: () => Promise<SourcePluginProject>;
  action: (project: SourcePluginProject) => Promise<T>;
}) {
  const project = await flush();
  return action(project);
}

/** Prevents autosave races while a build is creating an artifact. */
export async function runSourcePluginStudioBuild<T>({
  pauseAutosave,
  flush,
  build,
  applyBuild
}: {
  pauseAutosave: () => () => void;
  flush: () => Promise<SourcePluginProject>;
  build: (project: SourcePluginProject) => Promise<T>;
  applyBuild: (result: T) => void;
}) {
  const resumeAutosave = pauseAutosave();
  try {
    const project = await flush();
    const result = await build(project);
    applyBuild(result);
    return result;
  } finally {
    resumeAutosave();
  }
}

/** Flushes the draft before leaving the workbench. */
export async function runSourcePluginStudioClose({
  flush,
  close
}: {
  flush: () => Promise<unknown>;
  close: () => void;
}) {
  await flush();
  close();
}
