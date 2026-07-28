import { lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useSourcePluginProject,
  useSourcePluginProjects,
  type SourcePluginProject
} from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, LoadingState, Page, Panel, Stack } from '../../../shared/ui';
import { PluginStudioDashboard } from './PluginStudioDashboard';

const PluginStudioWorkbench = lazy(() =>
  import('./PluginStudioWorkbench').then((module) => ({
    default: module.PluginStudioWorkbench
  }))
);

export function SourcePluginStudio() {
  const { t } = useI18n();
  const navigate = useNavigate();
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
    if (selectedProject.isPending) {
      return (
        <Page className="max-w-none">
          <LoadingState />
        </Page>
      );
    }

    if (selectedProject.error || !selectedProject.data) {
      return (
        <Page className="max-w-none">
          <Panel tone="default" padding="lg">
            <Stack gap="md">
              <ErrorBanner error={selectedProject.error ?? t('pluginStudio.projectLoadFailed')} />
              <Button variant="secondary" onClick={clearProject}>
                {t('pluginStudio.returnToProjects')}
              </Button>
            </Stack>
          </Panel>
        </Page>
      );
    }

    return (
      <Page
        bottomInset="none"
        className="max-w-none px-0 pt-0 md:px-[var(--page-gutter)] md:pt-[var(--page-y)]"
      >
        <Suspense fallback={<LoadingState />}>
          <PluginStudioWorkbench
            key={selectedProject.data.id}
            project={selectedProject.data}
            onClose={clearProject}
          />
        </Suspense>
      </Page>
    );
  }

  return (
    <Page className="max-w-screen-2xl">
      <PluginStudioDashboard
        projects={projects.data ?? []}
        loading={projects.isPending}
        error={projects.error}
        onOpenProject={selectProject}
        onInstalled={() => navigate('/sources?section=plugins')}
      />
    </Page>
  );
}
