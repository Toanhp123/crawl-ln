import { useState } from 'react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { ErrorBanner, LoadingState } from '../../../shared/ui';
import { CreateSourcePluginProjectModal } from './CreateSourcePluginProjectModal';
import { InstallSourcePluginModal } from './InstallSourcePluginModal';
import { PluginStudioDashboardHeader } from './PluginStudioDashboardHeader';
import { PluginStudioProjectTable } from './PluginStudioProjectTable';

export function PluginStudioDashboard({
  projects,
  loading,
  error,
  onOpenProject,
  onProjectDeleted,
  onInstalled
}: {
  projects: SourcePluginProject[];
  loading: boolean;
  error: unknown;
  onOpenProject: (project: SourcePluginProject) => void;
  onProjectDeleted?: (project: SourcePluginProject) => void;
  onInstalled: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <>
      <PluginStudioDashboardHeader
        onCreate={() => setCreateOpen(true)}
        onInstall={() => setInstallOpen(true)}
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorBanner error={error} />
      ) : (
        <PluginStudioProjectTable
          projects={projects}
          onOpen={onOpenProject}
          onDeleted={onProjectDeleted}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      <CreateSourcePluginProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onOpenProject}
      />
      <InstallSourcePluginModal
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={onInstalled}
      />
    </>
  );
}
