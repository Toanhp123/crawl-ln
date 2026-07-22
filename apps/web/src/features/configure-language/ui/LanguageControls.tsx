import { useI18n } from '../../../shared/i18n';
import { SegmentedControl } from '../../../shared/ui';
import { useLanguageConfiguration } from '../model/use-language-configuration';

export function LanguageControls() {
  const model = useLanguageConfiguration();
  const { t } = useI18n();
  return (
    <SegmentedControl
      value={model.language}
      columns={2}
      ariaLabel={t('language.title')}
      items={[
        { id: 'en', label: t('language.en') },
        { id: 'vi', label: t('language.vi') }
      ]}
      onChange={model.setLanguage}
    />
  );
}
