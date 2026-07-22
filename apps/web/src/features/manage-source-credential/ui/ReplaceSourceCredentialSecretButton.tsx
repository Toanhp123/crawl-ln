import { Pencil } from 'lucide-react';
import { useState } from 'react';
import type { SourceCredential } from '../../../entities/source-credential';
import { useI18n } from '../../../shared/i18n';
import { Button, Drawer } from '../../../shared/ui';
import {
  buildCredentialSecret,
  clearCredentialSecrets,
  hasCredentialSecret
} from '../model/credential-secret';
import { useUpdateSourceCredentialSecret } from '../model/use-source-credential-actions';
import { CredentialSecretEditor } from './CredentialSecretEditor';

export function ReplaceSourceCredentialSecretButton({
  credential
}: {
  credential: SourceCredential;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [secrets, setSecrets] = useState(clearCredentialSecrets);
  const reset = () => setSecrets(clearCredentialSecrets());
  const update = useUpdateSourceCredentialSecret(
    credential.id,
    () => {
      setOpen(false);
      reset();
    },
    reset
  );
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Pencil size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('manageSourceCredential.replace')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title={t('manageSourceCredential.replaceTitle')}
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
            onClick={() => update.mutate(buildCredentialSecret(credential.strategy, secrets))}
          >
            {t('manageSourceCredential.save')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}
