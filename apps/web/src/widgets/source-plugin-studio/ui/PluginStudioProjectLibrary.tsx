import { Braces, FolderOpen } from 'lucide-react';
import {
  parseSourcePluginStudioManifest,
  type SourcePluginProject
} from '../../../entities/source-plugin-project';
import { DeleteSourcePluginProjectButton } from '../../../features/delete-source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import {
  ActionBar,
  Badge,
  Button,
  EmptyState,
  Panel,
  Section,
  Stack,
  Text
} from '../../../shared/ui';

export function PluginStudioProjectLibrary({
  projects,
  onOpen,
  onDeleted
}: {
  projects: SourcePluginProject[];
  onOpen: (project: SourcePluginProject) => void;
  onDeleted?: (project: SourcePluginProject) => void;
}) {
  const { t, date } = useI18n();

  return (
    <Section
      title={t('pluginStudio.projectsTitle')}
      description={t('pluginStudio.projectsDescription')}
    >
      {projects.length === 0 ? (
        <EmptyState
          icon={<Braces size={20} />}
          title={t('pluginStudio.projectsEmpty')}
          description={t('pluginStudio.projectsEmptyDescription')}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label={t('pluginStudio.projectsTitle')}>
          {projects.map((project) => {
            const manifest = parseSourcePluginStudioManifest(project.files['manifest.json'] ?? '');
            const metadata = manifest.metadata;
            return (
              <li key={project.id}>
                <Panel tone="default" padding="md" className="h-full">
                  <Stack gap="md" className="h-full">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Text as="h3" variant="cardTitle" truncate>
                          {metadata?.name ?? project.name}
                        </Text>
                        <Text as="p" variant="metadata" tone="muted" className="mt-1" truncate>
                          {metadata?.pluginId ?? project.pluginId}@
                          {metadata?.version ?? project.version}
                        </Text>
                      </div>
                      <Badge tone={project.build?.stale === false ? 'success' : 'neutral'}>
                        {t('pluginStudio.revision', { revision: project.revision })}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(metadata?.hosts ?? project.hosts).slice(0, 3).map((host) => (
                        <Badge key={host}>{host}</Badge>
                      ))}
                    </div>
                    <Text as="p" variant="caption" tone="muted" className="mt-auto">
                      {t('pluginStudio.updatedAt', { date: date(project.updatedAt) })}
                    </Text>
                    <ActionBar>
                      <Button
                        size="sm"
                        variant="secondary"
                        leadingIcon={<FolderOpen size={16} />}
                        onClick={() => onOpen(project)}
                      >
                        {t('pluginStudio.openProject')}
                      </Button>
                      <DeleteSourcePluginProjectButton
                        project={project}
                        onDeleted={() => onDeleted?.(project)}
                      />
                    </ActionBar>
                  </Stack>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
