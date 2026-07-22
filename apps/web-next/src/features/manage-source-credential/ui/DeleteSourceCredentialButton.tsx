import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, ConfirmDialog } from '../../../shared/ui';
import { useDeleteSourceCredential } from '../model/use-source-credential-actions';
export function DeleteSourceCredentialButton({ credentialId }: { credentialId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const remove = useDeleteSourceCredential(credentialId, () => setOpen(false));
  return (
    <>
      <Button
        size="sm"
        variant="danger"
        leadingIcon={<Trash2 size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('manageSourceCredential.delete')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('manageSourceCredential.deleteTitle')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
