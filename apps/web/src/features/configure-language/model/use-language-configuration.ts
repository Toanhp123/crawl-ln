import { useI18n, type Language } from '../../../shared/i18n';

const LANGUAGE_VALUES = ['en', 'vi'] as const;

export function useLanguageConfiguration() {
  const { language, setLanguage, t } = useI18n();
  return {
    language,
    setLanguage: (value: Language) => setLanguage(value),
    currentLabel: t(`language.${language}`),
    items: LANGUAGE_VALUES.map((id) => ({ id, label: t(`language.${id}`) }))
  };
}
