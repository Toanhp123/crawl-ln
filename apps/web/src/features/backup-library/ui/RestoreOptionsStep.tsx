import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, FilterChip, InlineNotice, Text } from '../../../shared/ui';
import type { RestoreMode, SettingsMode } from '../model/restore-validation';
import type { RestoreWizardController } from '../model/use-restore-wizard';

export function RestoreOptionsStep({ controller }: { controller: RestoreWizardController }) {
  const { t, errorMessage } = useI18n();
  const [mode, setMode] = useState<RestoreMode>(controller.state.mode);
  const [settingsPolicy, setSettingsPolicy] = useState<SettingsMode>(
    controller.state.settingsPolicy
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const plan = async () => {
    setLocalError(null);
    try {
      await controller.createPlan(mode, settingsPolicy);
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  };
  return (
    <section className="space-y-4" aria-labelledby="restore-options-title">
      <Text id="restore-options-title" as="h4" variant="section">
        {t('backup.restore.optionsTitle')}
      </Text>
      <div className="space-y-2">
        <Text as="p" variant="label">
          {t('backup.restore.modeTitle')}
        </Text>
        <div className="flex flex-wrap gap-2">
          {(['merge', 'replace'] as const).map((value) => (
            <FilterChip
              key={value}
              selected={mode === value}
              onClick={() => {
                setMode(value);
                controller.setOptions(value, settingsPolicy);
              }}
            >
              {t(`backup.mode.${value}`)}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Text as="p" variant="label">
          {t('backup.restore.settingsTitle')}
        </Text>
        <div className="flex flex-wrap gap-2">
          {(['keep-current', 'use-backup'] as const).map((value) => (
            <FilterChip
              key={value}
              selected={settingsPolicy === value}
              onClick={() => {
                setSettingsPolicy(value);
                controller.setOptions(mode, value);
              }}
            >
              {t(`backup.settings.${value}`)}
            </FilterChip>
          ))}
        </div>
      </div>
      {mode === 'replace' ? (
        <InlineNotice tone="warning">{t('backup.replaceWarning')}</InlineNotice>
      ) : null}
      {localError ? <InlineNotice tone="danger">{localError}</InlineNotice> : null}
      <Button full actionState={controller.busy ? 'pending' : 'idle'} onClick={() => void plan()}>
        {t('backup.restore.planAction')}
      </Button>
    </section>
  );
}
