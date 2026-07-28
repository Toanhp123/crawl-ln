import { FolderInput } from 'lucide-react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import {
  Button,
  Chip,
  Field,
  FilePicker,
  InlineNotice,
  LoadingState,
  SettingsOptionList,
  StatusList,
  Text
} from '../../../shared/ui';
import { useImportSourcePluginProject } from '../model/use-import-source-plugin-project';

export function ImportSourcePluginProjectForm({
  onImported
}: {
  onImported: (project: SourcePluginProject) => void;
}) {
  const { t } = useI18n();
  const flow = useImportSourcePluginProject(onImported);
  const preview = flow.preview;

  const resolutionItems = preview
    ? [
        {
          id: 'create-copy',
          label: t('importSourcePluginProject.createCopy'),
          description: t('importSourcePluginProject.createCopyDescription')
        },
        ...preview.conflicts.map((conflict) => ({
          id: `update:${conflict.id}`,
          label: t('importSourcePluginProject.update', { name: conflict.name }),
          description: t('importSourcePluginProject.updateDescription', {
            version: conflict.version,
            revision: conflict.revision
          })
        }))
      ]
    : [];

  return (
    <div className="space-y-5">
      <InlineNotice>{t('importSourcePluginProject.description')}</InlineNotice>
      <Field label={t('importSourcePluginProject.file')}>
        <FilePicker
          value={flow.file}
          accept=".zip,.source-plugin,application/zip"
          disabled={flow.step === 'importing'}
          error={flow.error}
          chooseLabel={t('importSourcePluginProject.choose')}
          dropLabel={t('importSourcePluginProject.drop')}
          emptyLabel={t('importSourcePluginProject.empty')}
          removeLabel={t('importSourcePluginProject.remove')}
          onChange={flow.chooseFile}
        />
      </Field>

      {flow.inspectionPending ? (
        <LoadingState
          title={t('importSourcePluginProject.inspecting')}
          description={t('importSourcePluginProject.inspectingDescription')}
        />
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <StatusList
            aria-label={t('importSourcePluginProject.preview')}
            items={[
              {
                key: 'kind',
                label: t('importSourcePluginProject.kind'),
                value: t(`importSourcePluginProject.kind.${preview.kind}`)
              },
              {
                key: 'name',
                label: t('importSourcePluginProject.name'),
                value: preview.name,
                description: preview.pluginId
              },
              {
                key: 'version',
                label: t('importSourcePluginProject.version'),
                value: preview.version
              }
            ]}
          />

          <div className="space-y-2">
            <Text as="div" variant="label" tone="secondary">
              {t('importSourcePluginProject.hosts')}
            </Text>
            <div className="flex flex-wrap gap-2">
              {preview.hosts.map((host) => (
                <Chip key={host}>{host}</Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Text as="div" variant="label" tone="secondary">
              {t('importSourcePluginProject.capabilities')}
            </Text>
            <div className="flex flex-wrap gap-2">
              {preview.capabilities.map((capability) => (
                <Chip key={capability} tone="primary">
                  {capability}
                </Chip>
              ))}
            </div>
          </div>

          {preview.ignoredFiles.length ? (
            <InlineNotice tone="warning">
              {t('importSourcePluginProject.ignoredFiles', {
                count: preview.ignoredFiles.length
              })}
            </InlineNotice>
          ) : null}

          {preview.kind === 'built-package' ? (
            <InlineNotice tone="danger">
              {t('importSourcePluginProject.builtPackageUnsupported')}
            </InlineNotice>
          ) : (
            <>
              {preview.conflicts.length ? (
                <InlineNotice tone="warning">
                  {t('importSourcePluginProject.conflicts', {
                    count: preview.conflicts.length
                  })}
                </InlineNotice>
              ) : null}
              <SettingsOptionList
                ariaLabel={t('importSourcePluginProject.resolution')}
                value={flow.resolutionId}
                items={resolutionItems}
                disabled={flow.step === 'importing'}
                onChange={flow.selectResolution}
              />
              <InlineNotice>{t('importSourcePluginProject.noBuildInstall')}</InlineNotice>
            </>
          )}

          <Button
            leadingIcon={<FolderInput size={17} />}
            actionState={flow.importActionState}
            disabled={!flow.canImport || flow.step === 'importing'}
            onClick={flow.confirmImport}
          >
            {t('importSourcePluginProject.action')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
