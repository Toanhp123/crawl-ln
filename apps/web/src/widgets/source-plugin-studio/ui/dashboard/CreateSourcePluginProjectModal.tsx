import type { SourcePluginProject } from '../../../../entities/source-plugin-project';
import {
  CreateSourcePluginProjectFields,
  useCreateSourcePluginProjectDraft
} from '../../../../features/create-source-plugin-project';
import { useI18n } from '../../../../shared/i18n';
import { ActionBar, Button, ErrorBanner, Modal } from '../../../../shared/ui';

const FORM_ID = 'create-source-plugin-project-form';

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
  const draft = useCreateSourcePluginProjectDraft((project) => {
    onOpenChange(false);
    onCreated(project);
  });
  const close = () => {
    draft.reset();
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (draft.isPending) return;
        if (!next) draft.reset();
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
          <Button
            type="submit"
            form={FORM_ID}
            actionState={draft.status}
            disabled={!draft.canSubmit}
          >
            {t('createSourcePluginProject.action')}
          </Button>
        </ActionBar>
      }
    >
      <form id={FORM_ID} onSubmit={draft.submit} className="space-y-5">
        <CreateSourcePluginProjectFields draft={draft} />
        <ErrorBanner error={draft.error} />
      </form>
    </Modal>
  );
}
