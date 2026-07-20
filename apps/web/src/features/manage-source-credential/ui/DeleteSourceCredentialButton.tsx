import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteSourceCredential } from '@/entities/source-credential';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, ConfirmDialog, toast } from '@/shared/ui';

export function DeleteSourceCredentialButton({ credentialId }: { credentialId: string }) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteSourceCredential(credentialId),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.credentials.deleted') });
      setOpen(false);
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.updateFailed'),
        description: errorMessage(error)
      })
  });
  return (
    <>
      <Button
        size="sm"
        variant="danger"
        leadingIcon={<Trash2 size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('sources.plugins.remove')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('sources.credentials.deleteTitle')}
        description={t('sources.credentials.deleteDescription')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
