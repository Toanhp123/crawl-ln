import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ConfirmDialog } from '../../../shared/ui';
import { useDeleteSourcePluginProject } from '../model/use-delete-source-plugin-project';

export function DeleteSourcePluginProjectButton({
  project,
  onDeleted
}: {
  project: Pick<SourcePluginProject, 'id' | 'name'>;
  onDeleted?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const remove = useDeleteSourcePluginProject(project.id, () => {
    setOpen(false);
    onDeleted?.();
  });

  return (
    <>
      <Button
        size="sm"
        variant="danger"
        leadingIcon={<Trash2 size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('deleteSourcePluginProject.action')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('deleteSourcePluginProject.confirmTitle')}
        description={t('deleteSourcePluginProject.confirmDescription', { name: project.name })}
        confirmText={t('deleteSourcePluginProject.action')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
