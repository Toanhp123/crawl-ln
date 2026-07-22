import { InspectSourceUrl } from '@/features/inspect-source-url';
import { useI18n } from '@/shared/i18n';
import { Panel, Section } from '@/shared/ui';

export function SourceInspector() {
  const { t } = useI18n();
  return (
    <Section title={t('sources.inspector.title')} description={t('sources.inspector.description')}>
      <Panel tone="default" padding="lg">
        <InspectSourceUrl />
      </Panel>
    </Section>
  );
}
