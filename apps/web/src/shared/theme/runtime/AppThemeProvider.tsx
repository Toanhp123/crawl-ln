import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BACKUP_SETTINGS_APPLIED_EVENT } from '../../events/backup-settings';

export type ThemePreference = 'system' | 'dark' | 'light';
export type AccentPreference = 'indigo' | 'blue' | 'emerald' | 'amber';
export type DensityPreference = 'compact' | 'comfortable';
export type AppFontPreference = 'small' | 'medium' | 'large' | 'extra-large';
type ResolvedTheme = 'dark' | 'light';

type ThemeValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  accent: AccentPreference;
  density: DensityPreference;
  appFont: AppFontPreference;
  setTheme: (value: ThemePreference) => void;
  setAccent: (value: AccentPreference) => void;
  setDensity: (value: DensityPreference) => void;
  setAppFont: (value: AppFontPreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);
const themeColors: Record<ResolvedTheme, string> = { dark: '#0f1115', light: '#f8f9fc' };

function resolveTheme(theme: ThemePreference): ResolvedTheme {
  return theme !== 'system'
    ? theme
    : window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', themeColors[resolved]);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('novel-tool-theme');
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  });
  const [accent, setAccentState] = useState<AccentPreference>(() => {
    const saved = localStorage.getItem('novel-tool-accent');
    return saved === 'blue' || saved === 'emerald' || saved === 'amber' ? saved : 'indigo';
  });
  const [density, setDensityState] = useState<DensityPreference>(() =>
    localStorage.getItem('novel-tool-density') === 'comfortable' ? 'comfortable' : 'compact'
  );
  const [appFont, setAppFontState] = useState<AppFontPreference>(() => {
    const saved = localStorage.getItem('novel-tool-app-font');
    return saved === 'small' || saved === 'large' || saved === 'extra-large' ? saved : 'medium';
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved = resolveTheme(theme);
      applyTheme(resolved);
      setResolvedTheme(resolved);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    const reloadBackupSettings = () => {
      const savedTheme = localStorage.getItem('novel-tool-theme');
      setThemeState(savedTheme === 'light' || savedTheme === 'system' ? savedTheme : 'dark');
      const savedAccent = localStorage.getItem('novel-tool-accent');
      setAccentState(
        savedAccent === 'blue' || savedAccent === 'emerald' || savedAccent === 'amber'
          ? savedAccent
          : 'indigo'
      );
      setDensityState(
        localStorage.getItem('novel-tool-density') === 'comfortable' ? 'comfortable' : 'compact'
      );
      const savedFont = localStorage.getItem('novel-tool-app-font');
      setAppFontState(
        savedFont === 'small' || savedFont === 'large' || savedFont === 'extra-large'
          ? savedFont
          : 'medium'
      );
    };
    window.addEventListener(BACKUP_SETTINGS_APPLIED_EVENT, reloadBackupSettings);
    return () => window.removeEventListener(BACKUP_SETTINGS_APPLIED_EVENT, reloadBackupSettings);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    localStorage.setItem('novel-tool-accent', accent);
  }, [accent]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem('novel-tool-density', density);
  }, [density]);
  useEffect(() => {
    document.documentElement.dataset.appFont = appFont;
    localStorage.setItem('novel-tool-app-font', appFont);
  }, [appFont]);

  const setTheme = (value: ThemePreference) => {
    localStorage.setItem('novel-tool-theme', value);
    setThemeState(value);
  };

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      accent,
      density,
      appFont,
      setTheme,
      setAccent: setAccentState,
      setDensity: setDensityState,
      setAppFont: setAppFontState
    }),
    [accent, appFont, density, resolvedTheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}
