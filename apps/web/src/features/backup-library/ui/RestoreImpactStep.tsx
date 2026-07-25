import { useI18n } from '../../../shared/i18n';
import { Button, InlineNotice, Text } from '../../../shared/ui';
import type { RestoreWizardController } from '../model/use-restore-wizard';

export function RestoreImpactStep({ controller }: { controller: RestoreWizardController }) {
  const { t, number, relativeTime } = useI18n();
  const session = controller.state.session;
  const plan = session?.mergePlan;
  const impact = plan?.impact;
  if (!session || !plan || !impact) {
    return <InlineNotice tone="danger">{t('backup.restore.planUnavailable')}</InlineNotice>;
  }
  const rows =
    plan.mode === 'merge'
      ? ([
          ['backup.restore.novelsNew', impact.novelsNew],
          ['backup.restore.novelsExisting', impact.novelsExisting],
          ['backup.restore.chaptersAdded', impact.chaptersAdded],
          ['backup.restore.chaptersSkipped', impact.chaptersSkipped],
          ['backup.restore.sourceRemaps', impact.sourceRemaps],
          ['backup.restore.tasksRestored', impact.tasksRestored],
          ['backup.restore.schedulerRestored', impact.schedulerPoliciesRestored],
          ['backup.restore.searchRebuilt', impact.searchDocumentsRebuilt]
        ] as const)
      : ([
          ['backup.restore.novelsTotal', impact.novelsTotal ?? 0],
          ['backup.restore.chaptersTotal', impact.chaptersTotal ?? 0],
          ['backup.restore.tasksTotal', impact.tasksTotal ?? 0],
          ['backup.restore.schedulerTotal', impact.schedulerPoliciesTotal ?? 0],
          ['backup.restore.searchTotal', impact.searchDocumentsTotal ?? 0]
        ] as const);
  return (
    <section className="space-y-3" aria-labelledby="restore-impact-title">
      <Text id="restore-impact-title" as="h4" variant="section">
        {t('backup.restore.impactTitle')}
      </Text>
      {controller.state.planStale ? (
        <InlineNotice tone="warning">{t('backup.restore.planStale')}</InlineNotice>
      ) : null}
      {plan.mode === 'replace' ? (
        <InlineNotice tone="warning">{t('backup.restore.safetyBackupRequired')}</InlineNotice>
      ) : null}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="type-body-sm text-muted">{t(key)}</dt>
            <dd className="type-body-sm text-right">{number(value)}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="type-body-sm text-muted">{t('backup.restore.settingsOutcome')}</dt>
          <dd className="type-body-sm text-right">
            {t(`backup.settings.${impact.settingsOutcome}`)}
          </dd>
        </div>
      </dl>
      <Text as="p" variant="caption" tone="muted">
        {t('backup.restore.sessionExpiry', { value: relativeTime(session.expiresAt) })}
      </Text>
      <Button full onClick={controller.reviewImpact}>
        {t('common.next')}
      </Button>
    </section>
  );
}
