import { Upload } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import {
  Button,
  Chip,
  Field,
  FilePicker,
  InlineNotice,
  LoadingState,
  Panel,
  StatusList,
  Text
} from '../../../shared/ui';
import { useSourcePluginInstallFlow } from '../model/use-source-plugin-install-flow';

export function InstallSourcePluginForm({
  onInstalled,
  surface = 'panel'
}: {
  onInstalled?: () => void;
  surface?: 'panel' | 'plain';
}) {
  const { t } = useI18n();
  const flow = useSourcePluginInstallFlow(onInstalled);
  const preview = flow.preview;

  const content = (
    <>
      {surface === 'panel' ? (
        <InlineNotice>{t('installSourcePlugin.description')}</InlineNotice>
      ) : null}
      <Field label={t('installSourcePlugin.file')}>
        <FilePicker
          value={flow.file}
          accept=".zip,.source-plugin,application/zip"
          disabled={flow.step === 'installing'}
          error={flow.error}
          chooseLabel={t('installSourcePlugin.choose')}
          dropLabel={t('installSourcePlugin.drop')}
          emptyLabel={t('installSourcePlugin.empty')}
          removeLabel={t('installSourcePlugin.remove')}
          onChange={flow.chooseFile}
        />
      </Field>
      {flow.inspectionPending ? (
        <LoadingState
          title={t('installSourcePlugin.inspecting')}
          description={t('installSourcePlugin.inspectingDescription')}
        />
      ) : null}
      {preview ? (
        <div className="space-y-3">
          <StatusList
            aria-label={t('installSourcePlugin.preview')}
            items={[
              {
                key: 'kind',
                label: t('installSourcePlugin.kind'),
                value: t(`installSourcePlugin.kind.${preview.kind}`)
              },
              {
                key: 'name',
                label: t('installSourcePlugin.name'),
                value: preview.name,
                description: preview.pluginId
              },
              {
                key: 'version',
                label: t('installSourcePlugin.version'),
                value: preview.version
              }
            ]}
          />
          <div className="space-y-2">
            <Text as="div" variant="label" tone="secondary">
              {t('installSourcePlugin.hosts')}
            </Text>
            <div className="flex flex-wrap gap-2">
              {preview.hosts.map((host) => (
                <Chip key={host}>{host}</Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Text as="div" variant="label" tone="secondary">
              {t('installSourcePlugin.capabilities')}
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
              {t('installSourcePlugin.ignoredFiles', { count: preview.ignoredFiles.length })}
            </InlineNotice>
          ) : null}
          <InlineNotice>
            {preview.kind === 'built-package'
              ? t('installSourcePlugin.builtAction')
              : t('installSourcePlugin.sourceAction')}
          </InlineNotice>
          <Button
            leadingIcon={<Upload size={17} />}
            actionState={flow.installActionState}
            disabled={flow.step === 'installing'}
            onClick={flow.confirmInstall}
          >
            {t('installSourcePlugin.confirm')}
          </Button>
        </div>
      ) : null}
      {flow.step === 'result' && flow.result ? (
        <InlineNotice tone="success">{t('installSourcePlugin.installed')}</InlineNotice>
      ) : null}
    </>
  );

  return surface === 'panel' ? (
    <Panel tone="default" padding="lg" className="space-y-4">
      {content}
    </Panel>
  ) : (
    <div className="space-y-4">{content}</div>
  );
}
