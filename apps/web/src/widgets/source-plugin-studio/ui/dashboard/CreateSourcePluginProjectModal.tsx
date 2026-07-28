import { FilePlus2, FolderInput } from 'lucide-react';
import { useState } from 'react';
import type { SourcePluginProject } from '../../../../entities/source-plugin-project';
import {
  CreateSourcePluginProjectFields,
  useCreateSourcePluginProjectDraft
} from '../../../../features/create-source-plugin-project';
import { ImportSourcePluginProjectForm } from '../../../../features/import-source-plugin-project';
import { useI18n } from '../../../../shared/i18n';
import { ActionBar, Button, ErrorBanner, Modal, SegmentedControl } from '../../../../shared/ui';

const FORM_ID = 'create-source-plugin-project-form';
type ProjectCreationMode = 'create-blank' | 'import-project';

export function CreateSourcePluginProjectModal({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: SourcePluginProject) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ProjectCreationMode>('create-blank');
  const finish = (project: SourcePluginProject) => {
    setMode('create-blank');
    onOpenChange(false);
    onCreated(project);
  };
  const draft = useCreateSourcePluginProjectDraft(finish);
  const close = () => {
    draft.reset();
    setMode('create-blank');
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (draft.isPending) return;
        if (!next) {
          draft.reset();
          setMode('create-blank');
        }
        onOpenChange(next);
      }}
      title={t('pluginStudio.newProject')}
      description={t('pluginStudio.newProjectDescription')}
      className="md:[--modal-width:64rem]"
      footer={
        <ActionBar className="justify-end">
          <Button variant="secondary" disabled={draft.isPending} onClick={close}>
            {t('common.cancel')}
          </Button>
          {mode === 'create-blank' ? (
            <Button
              type="submit"
              form={FORM_ID}
              actionState={draft.status}
              disabled={!draft.canSubmit}
            >
              {t('createSourcePluginProject.action')}
            </Button>
          ) : null}
        </ActionBar>
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          value={mode}
          columns={2}
          ariaLabel={t('importSourcePluginProject.modeLabel')}
          disabled={draft.isPending}
          items={[
            {
              id: 'create-blank',
              label: t('importSourcePluginProject.createBlank'),
              icon: <FilePlus2 size={17} aria-hidden="true" />
            },
            {
              id: 'import-project',
              label: t('importSourcePluginProject.importProject'),
              icon: <FolderInput size={17} aria-hidden="true" />
            }
          ]}
          onChange={(nextMode) => {
            draft.reset();
            setMode(nextMode);
          }}
        />

        {mode === 'create-blank' ? (
          <form id={FORM_ID} onSubmit={draft.submit} className="space-y-5">
            <CreateSourcePluginProjectFields draft={draft} />
            <ErrorBanner error={draft.error} />
          </form>
        ) : (
          <ImportSourcePluginProjectForm onImported={finish} />
        )}
      </div>
    </Modal>
  );
}
