import { useI18n } from '../../../shared/i18n';
import { useAppTheme, type AppFontPreference } from '../../../shared/theme';

const APP_FONT_VALUES = ['small', 'medium', 'large', 'extra-large'] as const;

export function useAppFontConfiguration() {
  const { appFont, setAppFont } = useAppTheme();
  const { t } = useI18n();
  const items = APP_FONT_VALUES.map((id) => ({ id, label: t(`appFont.${id}`) }));

  return {
    appFont,
    setAppFont: (value: AppFontPreference) => setAppFont(value),
    currentLabel: t(`appFont.${appFont}`),
    items
  };
}
