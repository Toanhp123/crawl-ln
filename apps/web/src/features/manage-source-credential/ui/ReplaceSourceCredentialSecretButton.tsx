import type { SourceReaderCredentialMetadata } from '@novel-tool/shared';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSourceCredentialSecret } from '@/entities/source-credential';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, Drawer, toast } from '@/shared/ui';
import {
  buildCredentialSecret,
  createEmptyCredentialSecrets,
  hasCredentialSecret
} from '../model/credentialSecret';
import { CredentialSecretEditor } from './CredentialSecretEditor';

export function ReplaceSourceCredentialSecretButton({
  credential
}: {
  credential: SourceReaderCredentialMetadata;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [secrets, setSecrets] = useState(createEmptyCredentialSecrets);
  const reset = () => setSecrets(createEmptyCredentialSecrets());
  const update = useMutation({
    mutationFn: () =>
      updateSourceCredentialSecret(credential.id, {
        secret: buildCredentialSecret(credential.strategy, secrets)
      }),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.credentials.updated') });
      setOpen(false);
      reset();
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.credentials.updateFailed'),
        description: errorMessage(error)
      }),
    onSettled: reset
  });
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Pencil size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('sources.credentials.replace')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title={t('sources.credentials.replaceTitle')}
      >
        <div className="space-y-4">
          <CredentialSecretEditor
            strategy={credential.strategy}
            value={secrets}
            onChange={setSecrets}
          />
          <Button
            full
            actionState={update.status}
            disabled={!hasCredentialSecret(credential.strategy, secrets)}
            onClick={() => update.mutate()}
          >
            {t('sources.common.save')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}
