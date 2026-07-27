import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSourcePluginProject,
  useSourcePluginProjects,
  type SourcePluginProject
} from '../../../entities/source-plugin-project';
import { CreateSourcePluginProjectForm } from '../../../features/create-source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, LoadingState, Panel, Stack } from '../../../shared/ui';
import { PluginStudioProjectLibrary } from './PluginStudioProjectLibrary';

const PluginStudioWorkbench = lazy(() =>
  import('./PluginStudioWorkbench').then((module) => ({
    default: module.PluginStudioWorkbench
  }))
);

export function SourcePluginStudio() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectId = searchParams.get('project');
  const projects = useSourcePluginProjects();
  const selectedProject = useSourcePluginProject(selectedProjectId);

  const selectProject = (project: Pick<SourcePluginProject, 'id'>) => {
    const next = new URLSearchParams(searchParams);
    next.set('project', project.id);
    setSearchParams(next);
  };

  const clearProject = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('project');
    setSearchParams(next);
  };

  if (selectedProjectId) {
    if (selectedProject.isPending) return <LoadingState />;
    if (selectedProject.error || !selectedProject.data) {
      return (
        <Panel tone="default" padding="lg">
          <Stack gap="md">
            <ErrorBanner error={selectedProject.error ?? t('pluginStudio.projectLoadFailed')} />
            <Button variant="secondary" onClick={clearProject}>
              {t('pluginStudio.returnToProjects')}
            </Button>
          </Stack>
        </Panel>
      );
    }

    return (
      <Suspense fallback={<LoadingState />}>
        <PluginStudioWorkbench
          key={selectedProject.data.id}
          project={selectedProject.data}
          onClose={clearProject}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-6">
      {projects.isPending ? (
        <LoadingState />
      ) : projects.error ? (
        <ErrorBanner error={projects.error} />
      ) : (
        <PluginStudioProjectLibrary projects={projects.data ?? []} onOpen={selectProject} />
      )}
      <CreateSourcePluginProjectForm onCreated={selectProject} />
    </div>
  );
}
