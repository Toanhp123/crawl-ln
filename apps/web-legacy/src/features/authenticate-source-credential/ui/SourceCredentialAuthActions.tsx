import type {
  SourceReaderCredentialMetadata,
  SourceReaderNetworkProfileMetadata
} from '@novel-tool/shared';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  loginSourceCredential,
  logoutSourceCredential,
  testSourceCredential
} from '@/entities/source-credential';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, Drawer, FilterChip, InlineNotice, toast } from '@/shared/ui';

type Action = 'login' | 'test' | 'logout';
export function SourceCredentialAuthActions({
  credential,
  profiles
}: {
  credential: SourceReaderCredentialMetadata;
  profiles: SourceReaderNetworkProfileMetadata[];
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [networkProfileId, setNetworkProfileId] = useState<string>();
  const action = useMutation({
    mutationFn: async (kind: Action) => {
      if (kind === 'logout') return logoutSourceCredential(credential.id);
      const input = networkProfileId ? { networkProfileId } : {};
      return kind === 'login'
        ? loginSourceCredential(credential.id, input)
        : testSourceCredential(credential.id, input);
    },
    onSuccess: (result) => {
      const challengeRequired =
        result && 'status' in result && result.status === 'challenge-required';
      toast({
        kind: challengeRequired ? 'info' : 'success',
        title: t(
          challengeRequired
            ? 'sources.credentials.challengeRequired'
            : 'sources.credentials.authCompleted'
        ),
        ...(challengeRequired && result.challenge.userInstructions
          ? { description: result.challenge.userInstructions }
          : {})
      });
      setOpen(false);
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.challenges() });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) })
  });
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<ShieldCheck size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('sources.credentials.test')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={credential.name}
        description={t('sources.credentials.description')}
      >
        <div className="space-y-4">
          <InlineNotice>{t('sources.inspector.network')}</InlineNotice>
          <div className="flex flex-wrap gap-2">
            <FilterChip selected={!networkProfileId} onClick={() => setNetworkProfileId(undefined)}>
              {t('sources.inspector.none')}
            </FilterChip>
            {profiles
              .filter((profile) => profile.enabled)
              .map((profile) => (
                <FilterChip
                  key={profile.id}
                  selected={networkProfileId === profile.id}
                  onClick={() => setNetworkProfileId(profile.id)}
                >
                  {profile.name}
                </FilterChip>
              ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              actionState={action.variables === 'login' ? action.status : 'idle'}
              leadingIcon={<LogIn size={16} />}
              onClick={() => action.mutate('login')}
            >
              {t('sources.credentials.login')}
            </Button>
            <Button
              variant="secondary"
              actionState={action.variables === 'test' ? action.status : 'idle'}
              leadingIcon={<ShieldCheck size={16} />}
              onClick={() => action.mutate('test')}
            >
              {t('sources.credentials.test')}
            </Button>
            <Button
              variant="ghost"
              actionState={action.variables === 'logout' ? action.status : 'idle'}
              leadingIcon={<LogOut size={16} />}
              onClick={() => action.mutate('logout')}
            >
              {t('sources.credentials.logout')}
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
