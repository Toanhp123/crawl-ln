import { Braces } from 'lucide-react';
import {
  parseSourcePluginStudioManifest,
  type SourcePluginProject
} from '../../../../entities/source-plugin-project';
import { DeleteSourcePluginProjectButton } from '../../../../features/delete-source-plugin-project';
import { useI18n } from '../../../../shared/i18n';
import {
  Badge,
  Button,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  EmptyState
} from '../../../../shared/ui';

function compactValues(values: string[], limit: number) {
  return {
    visible: values.slice(0, limit),
    remaining: Math.max(0, values.length - limit)
  };
}

export function PluginStudioProjectTable({
  projects,
  onOpen,
  onDeleted,
  onCreate
}: {
  projects: SourcePluginProject[];
  onOpen: (project: SourcePluginProject) => void;
  onDeleted?: (project: SourcePluginProject) => void;
  onCreate: () => void;
}) {
  const { t, date } = useI18n();

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Braces size={20} />}
        title={t('pluginStudio.projectsEmpty')}
        description={t('pluginStudio.projectsEmptyDescription')}
        action={<Button onClick={onCreate}>{t('pluginStudio.createProject')}</Button>}
        className="min-h-72"
      />
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>{t('pluginStudio.columnName')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('pluginStudio.columnPluginId')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('pluginStudio.columnVersion')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('pluginStudio.columnDomains')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('pluginStudio.columnCapabilities')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('pluginStudio.columnUpdated')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">
            {t('pluginStudio.columnActions')}
          </DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {projects.map((project) => {
          const manifest = parseSourcePluginStudioManifest(project.files['manifest.json'] ?? '');
          const metadata = manifest.metadata;
          const hosts = compactValues(metadata?.hosts ?? project.hosts, 2);
          const capabilities = compactValues(metadata?.capabilities ?? project.capabilities, 2);

          return (
            <tr key={project.id}>
              <DataTableCell>
                <div className="min-w-44">
                  <button
                    type="button"
                    className="max-w-64 truncate text-left font-semibold text-text transition-colors hover:text-primary focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    onClick={() => onOpen(project)}
                  >
                    {metadata?.name ?? project.name}
                  </button>
                  {!manifest.valid ? (
                    <div className="mt-1">
                      <Badge tone="danger">{t('pluginStudio.invalidManifestShort')}</Badge>
                    </div>
                  ) : null}
                </div>
              </DataTableCell>
              <DataTableCell className="font-mono type-caption">
                {metadata?.pluginId ?? project.pluginId}
              </DataTableCell>
              <DataTableCell>{metadata?.version ?? project.version}</DataTableCell>
              <DataTableCell>
                <div className="flex max-w-72 flex-wrap gap-1.5">
                  {hosts.visible.map((host) => (
                    <Badge key={host}>{host}</Badge>
                  ))}
                  {hosts.remaining > 0 ? <Badge>+{hosts.remaining}</Badge> : null}
                </div>
              </DataTableCell>
              <DataTableCell>
                <div className="flex max-w-72 flex-wrap gap-1.5">
                  {capabilities.visible.map((capability) => (
                    <Badge key={capability}>{capability}</Badge>
                  ))}
                  {capabilities.remaining > 0 ? <Badge>+{capabilities.remaining}</Badge> : null}
                </div>
              </DataTableCell>
              <DataTableCell className="whitespace-nowrap text-secondary">
                {date(project.updatedAt)}
              </DataTableCell>
              <DataTableCell>
                <div className="flex justify-end">
                  <DeleteSourcePluginProjectButton
                    project={project}
                    onDeleted={() => onDeleted?.(project)}
                  />
                </div>
              </DataTableCell>
            </tr>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
