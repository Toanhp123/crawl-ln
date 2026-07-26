import { lazy, Suspense, useState } from 'react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { CreateSourcePluginProjectForm } from '../../../features/create-source-plugin-project';
import { LoadingState } from '../../../shared/ui';

const PluginStudioWorkbench = lazy(() =>
  import('./PluginStudioWorkbench').then((module) => ({
    default: module.PluginStudioWorkbench
  }))
);

export function SourcePluginStudio() {
  const [project, setProject] = useState<SourcePluginProject>();
  return project ? (
    <Suspense fallback={<LoadingState />}>
      <PluginStudioWorkbench key={project.id} project={project} />
    </Suspense>
  ) : (
    <CreateSourcePluginProjectForm onCreated={setProject} />
  );
}
