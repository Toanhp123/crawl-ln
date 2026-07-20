import type {
  SourceReaderAuthChallenge,
  SourceReaderAuthChallengeResponse
} from '@novel-tool/shared';
import { Ban, Check, X } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cancelSourceAuthChallenge,
  respondSourceAuthChallenge
} from '@/entities/source-auth-challenge';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, Field, InlineNotice, Input, toast } from '@/shared/ui';
export function ResolveSourceAuthChallenge({
  challenge
}: {
  challenge: SourceReaderAuthChallenge;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: queryKeys.sourceReader.challenges() });
    void client.invalidateQueries({ queryKey: queryKeys.sourceReader.challenge(challenge.id) });
  };
  const respond = useMutation({
    mutationFn: (response: SourceReaderAuthChallengeResponse) =>
      respondSourceAuthChallenge(challenge.id, response),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.challenges.resolved') });
      setCode('');
      invalidate();
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) })
  });
  const cancel = useMutation({
    mutationFn: () => cancelSourceAuthChallenge(challenge.id),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.challenges.cancelled') });
      invalidate();
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) })
  });
  return (
    <div className="space-y-3">
      {challenge.type === 'otp' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('sources.challenges.otp')}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          </div>
          <Button
            actionState={respond.status}
            disabled={!code.trim()}
            onClick={() => respond.mutate({ type: 'otp', code: code.trim() })}
          >
            {t('sources.challenges.submitOtp')}
          </Button>
        </div>
      ) : null}
      {challenge.type === 'approval' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            leadingIcon={<Check size={16} />}
            actionState={
              respond.variables?.type === 'approval' && respond.variables.approved
                ? respond.status
                : 'idle'
            }
            onClick={() => respond.mutate({ type: 'approval', approved: true })}
          >
            {t('sources.challenges.approve')}
          </Button>
          <Button
            variant="danger"
            leadingIcon={<X size={16} />}
            actionState={
              respond.variables?.type === 'approval' && !respond.variables.approved
                ? respond.status
                : 'idle'
            }
            onClick={() => respond.mutate({ type: 'approval', approved: false })}
          >
            {t('sources.challenges.reject')}
          </Button>
        </div>
      ) : null}
      {challenge.type === 'browser-interaction' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            actionState={
              respond.variables?.type === 'browser-interaction' && respond.variables.completed
                ? respond.status
                : 'idle'
            }
            onClick={() => respond.mutate({ type: 'browser-interaction', completed: true })}
          >
            {t('sources.challenges.completed')}
          </Button>
          <Button
            variant="secondary"
            actionState={
              respond.variables?.type === 'browser-interaction' && !respond.variables.completed
                ? respond.status
                : 'idle'
            }
            onClick={() => respond.mutate({ type: 'browser-interaction', completed: false })}
          >
            {t('sources.challenges.notCompleted')}
          </Button>
        </div>
      ) : null}
      {challenge.type === 'captcha' ? (
        <InlineNotice>{t('sources.challenges.captcha')}</InlineNotice>
      ) : null}
      <Button
        variant="ghost"
        leadingIcon={<Ban size={16} />}
        actionState={cancel.status}
        onClick={() => cancel.mutate()}
      >
        {t('sources.challenges.cancel')}
      </Button>
    </div>
  );
}
