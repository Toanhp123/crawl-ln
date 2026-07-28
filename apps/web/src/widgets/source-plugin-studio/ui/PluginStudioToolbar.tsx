import { ArrowLeft, Download, FlaskConical, Hammer, PackageCheck } from 'lucide-react';
import type {
  SourcePluginProject,
  SourcePluginStudioManifestState
} from '../../../entities/source-plugin-project';
import type { SourcePluginWorkspaceStatus } from '../../../features/edit-source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { ActionBar, Badge, Button, type ActionState } from '../../../shared/ui';
import type { SourcePluginStudioDiagnosticSummary } from '../model/source-plugin-studio-diagnostics';

function statusTone(status: SourcePluginWorkspaceStatus) {
  if (status === 'conflict' || status === 'error') return 'danger' as const;
  if (status === 'dirty' || status === 'saving') return 'warning' as const;
  return 'success' as const;
}

function diagnosticTone(summary: SourcePluginStudioDiagnosticSummary) {
  if (summary.errors > 0) return 'danger' as const;
  if (summary.warnings > 0) return 'warning' as const;
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
    <header
      className="flex min-h-[var(--toolbar-height)] flex-wrap items-center gap-2 border-b border-border bg-[hsl(var(--color-bg-elevated)/.96)] px-2 py-2 backdrop-blur-xl sm:gap-3 sm:px-3"
      data-studio-command-bar=""
    >
      <Button
        size="sm"
        variant="ghost"
        actionState={closeState}
        disabled={busy}
        leadingIcon={<ArrowLeft size={16} />}
        aria-label={t('pluginStudio.backToProjects')}
        onClick={onClose}
      >
        <span className="hidden sm:inline">{t('pluginStudio.backToProjects')}</span>
      </Button>

      <div className="min-w-0 flex-1 sm:min-w-[12rem]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate type-title-sm font-semibold text-text">
            {metadata?.name ?? project.name}
          </h2>
          <Badge tone={statusTone(workspaceStatus)}>
            {t(`editSourcePluginProject.${workspaceStatus}`)}
          </Badge>
        </div>
        <p className="truncate type-metadata text-muted">
          {metadata?.pluginId ?? project.pluginId}@{metadata?.version ?? project.version}
          {' · '}
          {t('pluginStudio.revision', { revision: project.revision })}
        </p>
        <div className="mt-1 hidden flex-wrap gap-1.5 sm:flex">
          <Badge tone={manifest.valid ? 'success' : 'danger'}>
            {t(manifest.valid ? 'pluginStudio.manifestValid' : 'pluginStudio.manifestInvalid')}
          </Badge>
          <Badge tone={buildCurrent ? 'success' : 'warning'}>
            {t(buildCurrent ? 'pluginStudio.buildCurrent' : 'pluginStudio.buildStale')}
          </Badge>
        </div>
      </div>

      <ActionBar className="w-full justify-end overflow-x-auto pb-0.5 sm:overflow-visible sm:pb-0 lg:w-auto">
        <Badge className="hidden sm:inline-flex" tone={diagnosticTone(diagnosticSummary)}>
          {t('pluginStudio.diagnosticSummary', {
            errors: diagnosticSummary.errors,
            warnings: diagnosticSummary.warnings
          })}
        </Badge>
        <Button
          size="sm"
          variant="secondary"
          actionState={buildState}
          disabled={actionDisabled}
          leadingIcon={<Hammer size={16} />}
          aria-label={t('buildSourcePluginProject.action')}
          onClick={onBuild}
        >
          <span className="hidden sm:inline">{t('buildSourcePluginProject.action')}</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          actionState={testState}
          disabled={actionDisabled}
          leadingIcon={<FlaskConical size={16} />}
          aria-label={t('testSourcePluginProject.action')}
          onClick={onTest}
        >
          <span className="hidden sm:inline">{t('testSourcePluginProject.action')}</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          actionState={exportState}
          disabled={actionDisabled || !buildCurrent}
          leadingIcon={<Download size={16} />}
          aria-label={t('exportSourcePluginProject.action')}
          onClick={onExport}
        >
          <span className="hidden sm:inline">{t('exportSourcePluginProject.action')}</span>
        </Button>
        <Button
          size="sm"
          actionState={installState}
          disabled={actionDisabled || !buildCurrent}
          leadingIcon={<PackageCheck size={16} />}
          aria-label={t('installSourcePluginProject.action')}
          onClick={onInstall}
        >
          <span className="hidden sm:inline">{t('installSourcePluginProject.action')}</span>
        </Button>
      </ActionBar>
    </header>
  );
}
