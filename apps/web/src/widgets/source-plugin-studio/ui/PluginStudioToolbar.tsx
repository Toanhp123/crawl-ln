import { ArrowLeft, Braces, Download, FlaskConical, Hammer, PackageCheck } from 'lucide-react';
import type {
  SourcePluginProject,
  SourcePluginStudioManifestState
} from '../../../entities/source-plugin-project';
import type { SourcePluginWorkspaceStatus } from '../../../features/edit-source-plugin-project';
import type { SourcePluginStudioDiagnosticSummary } from '../model/source-plugin-studio-diagnostics';
import { useI18n } from '../../../shared/i18n';
import { ActionBar, Badge, Button, IconTile, Toolbar, type ActionState } from '../../../shared/ui';

function statusTone(status: SourcePluginWorkspaceStatus) {
  if (status === 'conflict' || status === 'error') return 'danger' as const;
  if (status === 'dirty' || status === 'saving') return 'warning' as const;
  return 'success' as const;
}

export function PluginStudioToolbar({
  project,
  manifest,
  workspaceStatus,
  buildCurrent,
  busy,
  buildState,
  testState,
  exportState,
  installState,
  closeState,
  diagnosticSummary,
  onClose,
  onBuild,
  onTest,
  onExport,
  onInstall
}: {
  project: SourcePluginProject;
  manifest: SourcePluginStudioManifestState;
  workspaceStatus: SourcePluginWorkspaceStatus;
  buildCurrent: boolean;
  busy: boolean;
  buildState: ActionState;
  testState: ActionState;
  exportState: ActionState;
  installState: ActionState;
  closeState: ActionState;
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
  onClose: () => void;
  onBuild: () => void;
  onTest: () => void;
  onExport: () => void;
  onInstall: () => void;
}) {
  const { t } = useI18n();
  const metadata = manifest.metadata;
  const actionDisabled = busy || !manifest.valid;
  return (
    <Toolbar
      className="flex-wrap"
      leading={
        <IconTile tone="primary">
          <Braces size={18} />
        </IconTile>
      }
      title={metadata?.name ?? project.name}
      description={`${metadata?.pluginId ?? project.pluginId}@${metadata?.version ?? project.version} - ${t('pluginStudio.revision', { revision: project.revision })}`}
      actions={
        <ActionBar className="w-full sm:w-auto">
          <Button
            size="sm"
            variant="ghost"
            actionState={closeState}
            disabled={busy}
            leadingIcon={<ArrowLeft size={16} />}
            onClick={onClose}
          >
            {t('pluginStudio.backToProjects')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            actionState={buildState}
            disabled={actionDisabled}
            leadingIcon={<Hammer size={16} />}
            onClick={onBuild}
          >
            {t('buildSourcePluginProject.action')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            actionState={testState}
            disabled={actionDisabled}
            leadingIcon={<FlaskConical size={16} />}
            onClick={onTest}
          >
            {t('testSourcePluginProject.action')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            actionState={exportState}
            disabled={actionDisabled || !buildCurrent}
            leadingIcon={<Download size={16} />}
            onClick={onExport}
          >
            {t('exportSourcePluginProject.action')}
          </Button>
          <Button
            size="sm"
            actionState={installState}
            disabled={actionDisabled || !buildCurrent}
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
        <Badge tone={manifest.valid ? 'success' : 'danger'}>
          {t(manifest.valid ? 'pluginStudio.manifestValid' : 'pluginStudio.manifestInvalid')}
        </Badge>
        <Badge
          tone={
            diagnosticSummary.errors > 0
              ? 'danger'
              : diagnosticSummary.warnings > 0
                ? 'warning'
                : 'success'
          }
        >
          {t('pluginStudio.diagnosticSummary', {
            errors: diagnosticSummary.errors,
            warnings: diagnosticSummary.warnings
          })}
        </Badge>
        <Badge tone={buildCurrent ? 'success' : 'warning'}>
          {t(buildCurrent ? 'pluginStudio.buildCurrent' : 'pluginStudio.buildStale')}
        </Badge>
      </div>
    </Toolbar>
  );
}
