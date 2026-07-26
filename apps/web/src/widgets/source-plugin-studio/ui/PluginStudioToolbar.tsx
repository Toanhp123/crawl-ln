import { Braces, Download, FlaskConical, Hammer, PackageCheck } from 'lucide-react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import type { SourcePluginWorkspaceStatus } from '../../../features/edit-source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { ActionBar, Badge, Button, IconTile, Toolbar, type ActionState } from '../../../shared/ui';

function statusTone(status: SourcePluginWorkspaceStatus) {
  if (status === 'conflict' || status === 'error') return 'danger' as const;
  if (status === 'dirty' || status === 'saving') return 'warning' as const;
  return 'success' as const;
}

export function PluginStudioToolbar({
  project,
  workspaceStatus,
  buildCurrent,
  busy,
  buildState,
  testState,
  exportState,
  installState,
  onBuild,
  onTest,
  onExport,
  onInstall
}: {
  project: SourcePluginProject;
  workspaceStatus: SourcePluginWorkspaceStatus;
  buildCurrent: boolean;
  busy: boolean;
  buildState: ActionState;
  testState: ActionState;
  exportState: ActionState;
  installState: ActionState;
  onBuild: () => void;
  onTest: () => void;
  onExport: () => void;
  onInstall: () => void;
}) {
  const { t } = useI18n();
  return (
    <Toolbar
      className="flex-wrap"
      leading={
        <IconTile tone="primary">
          <Braces size={18} />
        </IconTile>
      }
      title={project.name}
      description={`${project.pluginId}@${project.version} - ${t('pluginStudio.revision', { revision: project.revision })}`}
      actions={
        <ActionBar className="w-full sm:w-auto">
          <Button
            size="sm"
            variant="secondary"
            actionState={buildState}
            disabled={busy}
            leadingIcon={<Hammer size={16} />}
            onClick={onBuild}
          >
            {t('buildSourcePluginProject.action')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            actionState={testState}
            disabled={busy}
            leadingIcon={<FlaskConical size={16} />}
            onClick={onTest}
          >
            {t('testSourcePluginProject.action')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            actionState={exportState}
            disabled={busy || !buildCurrent}
            leadingIcon={<Download size={16} />}
            onClick={onExport}
          >
            {t('exportSourcePluginProject.action')}
          </Button>
          <Button
            size="sm"
            actionState={installState}
            disabled={busy || !buildCurrent}
            leadingIcon={<PackageCheck size={16} />}
            onClick={onInstall}
          >
            {t('installSourcePluginProject.action')}
          </Button>
        </ActionBar>
      }
    >
      <div className="mt-1 flex flex-wrap gap-2">
        <Badge tone={statusTone(workspaceStatus)}>
          {t(`editSourcePluginProject.${workspaceStatus}`)}
        </Badge>
        <Badge tone={buildCurrent ? 'success' : 'warning'}>
          {t(buildCurrent ? 'pluginStudio.buildCurrent' : 'pluginStudio.buildStale')}
        </Badge>
      </div>
    </Toolbar>
  );
}
