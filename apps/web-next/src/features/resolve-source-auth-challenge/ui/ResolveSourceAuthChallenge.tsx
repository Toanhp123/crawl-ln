import { Ban, Check, X } from 'lucide-react';
import { useState } from 'react';
import type { SourceAuthChallenge } from '../../../entities/source-auth-challenge';
import { useI18n } from '../../../shared/i18n';
import { Button, Field, InlineNotice, Input } from '../../../shared/ui';
import { useResolveSourceAuthChallenge } from '../model/use-resolve-source-auth-challenge';
export function ResolveSourceAuthChallenge({ challenge }: { challenge: SourceAuthChallenge }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const action = useResolveSourceAuthChallenge(challenge.id, () => setCode(''));
  return (
    <div className="space-y-3">
      {challenge.type === 'otp' ? (
        <div className="flex gap-2">
          <Field label={t('resolveSourceAuthChallenge.otp')}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Button
            actionState={action.respond.status}
            disabled={!code.trim()}
            onClick={() => action.respond.mutate({ type: 'otp', code: code.trim() })}
          >
            {t('resolveSourceAuthChallenge.submit')}
          </Button>
        </div>
      ) : null}
      {challenge.type === 'approval' ? (
        <div className="flex gap-2">
          <Button
            leadingIcon={<Check size={16} />}
            onClick={() => action.respond.mutate({ type: 'approval', approved: true })}
          >
            {t('resolveSourceAuthChallenge.approve')}
          </Button>
          <Button
            variant="danger"
            leadingIcon={<X size={16} />}
            onClick={() => action.respond.mutate({ type: 'approval', approved: false })}
          >
            {t('resolveSourceAuthChallenge.reject')}
          </Button>
        </div>
      ) : null}
      {challenge.type === 'browser-interaction' ? (
        <Button
          onClick={() => action.respond.mutate({ type: 'browser-interaction', completed: true })}
        >
          {t('resolveSourceAuthChallenge.completed')}
        </Button>
      ) : null}
      {challenge.type === 'captcha' ? (
        <InlineNotice>{t('resolveSourceAuthChallenge.captcha')}</InlineNotice>
      ) : null}
      <Button
        variant="ghost"
        leadingIcon={<Ban size={16} />}
        actionState={action.cancel.status}
        onClick={() => action.cancel.mutate()}
      >
        {t('resolveSourceAuthChallenge.cancel')}
      </Button>
    </div>
  );
}
