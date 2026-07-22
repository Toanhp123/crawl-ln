import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button } from '../../../shared/ui';
import { useSourceCredentialAuth } from '../model/use-source-credential-auth';
export function SourceCredentialAuthActions({
  credentialId,
  networkProfileId
}: {
  credentialId: string;
  networkProfileId?: string;
}) {
  const { t } = useI18n();
  const auth = useSourceCredentialAuth(credentialId);
  const input = networkProfileId ? { networkProfileId } : {};
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        leadingIcon={<LogIn size={16} />}
        actionState={auth.login.status}
        onClick={() => auth.login.mutate(input)}
      >
        {t('authenticateSourceCredential.login')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<ShieldCheck size={16} />}
        actionState={auth.test.status}
        onClick={() => auth.test.mutate(input)}
      >
        {t('authenticateSourceCredential.test')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        leadingIcon={<LogOut size={16} />}
        actionState={auth.logout.status}
        onClick={() => auth.logout.mutate()}
      >
        {t('authenticateSourceCredential.logout')}
      </Button>
    </div>
  );
}
