import type { SourcePluginProject } from '../../../entities/source-plugin-project';

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
