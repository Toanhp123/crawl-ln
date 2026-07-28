import { useState } from 'react';
import { PackagePlus, Plus } from 'lucide-react';
import type { SourcePluginProject } from '../../../../entities/source-plugin-project';
import { useI18n } from '../../../../shared/i18n';
import { ActionBar, Button, ErrorBanner, LoadingState, PageHeader } from '../../../../shared/ui';
import { CreateSourcePluginProjectModal } from './CreateSourcePluginProjectModal';
import { InstallSourcePluginModal } from './InstallSourcePluginModal';
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
  const { t } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow={t('pluginStudio.eyebrow')}
        title={t('pluginStudio.title')}
        description={t('pluginStudio.description')}
        action={
          <ActionBar className="justify-end">
            <Button
              variant="secondary"
              leadingIcon={<PackagePlus size={17} />}
              onClick={() => setInstallOpen(true)}
            >
              {t('pluginStudio.installPackage')}
            </Button>
            <Button leadingIcon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>
              {t('pluginStudio.newProject')}
            </Button>
          </ActionBar>
        }
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
