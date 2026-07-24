import { useI18n } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/theme';

const THEME_VALUES = ['system', 'dark', 'light'] as const;
const ACCENT_VALUES = ['indigo', 'blue', 'emerald', 'amber'] as const;
const DENSITY_VALUES = ['compact', 'comfortable'] as const;

export function useAppearanceConfiguration() {
  const theme = useAppTheme();
  const { t } = useI18n();
  return {
    theme: theme.theme,
    accent: theme.accent,
    density: theme.density,
    setTheme: theme.setTheme,
    setAccent: theme.setAccent,
    setDensity: theme.setDensity,
    themeItems: THEME_VALUES.map((id) => ({ id, label: t(`appearance.${id}`) })),
    accentItems: ACCENT_VALUES.map((id) => ({ id, label: t(`appearance.${id}`) })),
    densityItems: DENSITY_VALUES.map((id) => ({ id, label: t(`appearance.${id}`) })),
    summary: [
      t(`appearance.${theme.theme}`),
      t(`appearance.${theme.accent}`),
      t(`appearance.${theme.density}`)
    ].join(' · ')
  };
}
