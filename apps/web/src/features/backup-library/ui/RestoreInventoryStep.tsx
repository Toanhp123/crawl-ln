import { useI18n } from '../../../shared/i18n';
import { Button, InlineNotice, Text } from '../../../shared/ui';
import type { RestoreWizardController } from '../model/use-restore-wizard';

export function RestoreInventoryStep({ controller }: { controller: RestoreWizardController }) {
  const { t, date, number } = useI18n();
  const inventory = controller.state.session?.inventory;
  const compatibility = controller.state.session?.compatibility;
  if (!inventory || !compatibility) {
    return <InlineNotice tone="danger">{t('backup.restore.inventoryUnavailable')}</InlineNotice>;
  }
  const rows: Array<[string, string]> = [
    [t('backup.restore.createdAt'), date(inventory.createdAt)],
    [t('backup.restore.appVersion'), inventory.appVersion],
    [t('backup.restore.schema'), number(inventory.schemaVersion)],
    [t('backup.restore.archiveSize'), number(inventory.archiveSizeBytes)],
    [
      t('backup.restore.encryption'),
      inventory.encrypted ? t('backup.encrypted') : t('backup.unencrypted')
    ],
    [
      t('backup.restore.compatibility'),
      compatibility.compatible
        ? compatibility.upgradedFrom
          ? t('backup.restore.compatibilityUpgraded', { version: compatibility.upgradedFrom })
          : t('backup.restore.compatibilityDirect')
        : t('backup.restore.compatibilityBlocked')
    ],
    [
      t('backup.restore.libraryCounts'),
      `${number(inventory.library.novels)} / ${number(inventory.library.chapters)}`
    ],
    [
      t('backup.restore.sourceCounts'),
      `${number(inventory.sources.plugins)} / ${number(inventory.sources.credentials)} / ${number(inventory.sources.networkProfiles)}`
    ],
    [
      t('backup.restore.ingestionCounts'),
      `${number(inventory.ingestion.tasks)} / ${number(inventory.ingestion.events)}`
    ],
    [
      t('backup.restore.schedulerCounts'),
      `${number(inventory.scheduler.policies)} / ${number(inventory.scheduler.diagnostics)}`
    ],
    [t('backup.restore.searchCounts'), number(inventory.search.indexedDocuments)],
    [
      t('backup.restore.settingsCounts'),
      `${number(inventory.settings.count)} (${inventory.settings.groups.join(', ') || '—'})`
    ]
  ];
  return (
    <section className="space-y-3" aria-labelledby="restore-inventory-title">
      <Text id="restore-inventory-title" as="h4" variant="section">
        {t('backup.restore.inventoryTitle')}
      </Text>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="type-body-sm text-muted">{label}</dt>
            <dd className="type-body-sm text-right text-text">{value}</dd>
          </div>
        ))}
      </dl>
      {!compatibility.compatible ? (
        <InlineNotice tone="danger">
          {t('backup.restore.compatibilityBlockedDescription')}
        </InlineNotice>
      ) : (
        <Button full onClick={controller.reviewInventory}>
          {t('common.next')}
        </Button>
      )}
    </section>
  );
}
