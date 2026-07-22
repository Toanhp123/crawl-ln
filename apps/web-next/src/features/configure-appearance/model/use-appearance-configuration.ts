import { useAppTheme } from '../../../shared/theme';

export function useAppearanceConfiguration() {
  const theme = useAppTheme();
  return {
    theme: theme.theme,
    accent: theme.accent,
    density: theme.density,
    appFont: theme.appFont,
    setTheme: theme.setTheme,
    setAccent: theme.setAccent,
    setDensity: theme.setDensity,
    setAppFont: theme.setAppFont
  };
}
