import type { SourcePluginProject } from '../../../entities/source-plugin-project';

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
