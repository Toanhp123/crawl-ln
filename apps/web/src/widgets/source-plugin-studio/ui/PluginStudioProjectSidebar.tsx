import type {
  SourcePluginProject,
  SourcePluginStudioManifestState
} from '../../../entities/source-plugin-project';
import type { SourcePluginWorkspaceStatus } from '../../../features/edit-source-plugin-project';
import { PanelLeftClose } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Badge, IconButton, Text } from '../../../shared/ui';
import type { SourcePluginStudioDiagnosticsByPath } from '../model/source-plugin-studio-diagnostics';
import { PluginProjectFileTree } from './PluginProjectFileTree';

function statusTone(status: SourcePluginWorkspaceStatus) {
  if (status === 'conflict' || status === 'error') return 'danger' as const;
  if (status === 'dirty' || status === 'saving') return 'warning' as const;
  return 'success' as const;
}

export function PluginStudioProjectSidebar({
  project,
  manifest,
  workspaceStatus,
  files,
  selectedFile,
  disabled,
  diagnosticsByPath,
  collapseLabel,
  onCollapse,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDuplicate,
  onDelete
}: {
  project: SourcePluginProject;
  manifest: SourcePluginStudioManifestState;
  workspaceStatus: SourcePluginWorkspaceStatus;
  files: string[];
  selectedFile: string;
  disabled?: boolean;
  diagnosticsByPath: SourcePluginStudioDiagnosticsByPath;
  collapseLabel: string;
  onCollapse: () => void;
  onSelect: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onRename: (currentPath: string, nextPath: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const { t } = useI18n();
  const metadata = manifest.metadata;

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col"
      aria-label={t('pluginStudio.projectSummary')}
    >
      <div className="border-b border-border px-3 py-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <Text as="h2" variant="titleSm" truncate title={metadata?.name ?? project.name}>
              {metadata?.name ?? project.name}
            </Text>
            <Text
              as="p"
              variant="metadata"
              tone="muted"
              truncate
              className="mt-0.5 font-mono"
              title={metadata?.pluginId ?? project.pluginId}
            >
              {metadata?.pluginId ?? project.pluginId}
            </Text>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge tone={statusTone(workspaceStatus)}>
              {t(`editSourcePluginProject.${workspaceStatus}`)}
            </Badge>
            <IconButton
              variant="ghost"
              className="hidden h-8 w-8 lg:inline-flex"
              aria-label={collapseLabel}
              title={collapseLabel}
              onClick={onCollapse}
            >
              <PanelLeftClose size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
        <Text as="p" variant="caption" tone="muted" className="mt-2">
          {t('pluginStudio.revision', { revision: project.revision })}
        </Text>
      </div>

      <PluginProjectFileTree
        files={files}
        selectedFile={selectedFile}
        disabled={disabled}
        diagnosticsByPath={diagnosticsByPath}
        onSelect={onSelect}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </aside>
  );
}
