import { useI18n } from '../../../shared/i18n';
import { SettingsOptionList } from '../../../shared/ui';
import { useLanguageConfiguration } from '../model/use-language-configuration';

export function LanguageControls() {
  const model = useLanguageConfiguration();
  const { t } = useI18n();
  return (
    <SettingsOptionList
      ariaLabel={t('language.title')}
      value={model.language}
      items={model.items}
      onChange={model.setLanguage}
    />
  );
}
