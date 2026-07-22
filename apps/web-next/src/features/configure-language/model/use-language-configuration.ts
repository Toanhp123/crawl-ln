import { useI18n } from '../../../shared/i18n';

export function useLanguageConfiguration() {
  const { language, setLanguage } = useI18n();
  return { language, setLanguage };
}
