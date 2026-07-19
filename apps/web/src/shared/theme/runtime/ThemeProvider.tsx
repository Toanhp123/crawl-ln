import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';
export type AccentPreference = 'indigo' | 'blue' | 'emerald' | 'amber';
export type DensityPreference = 'compact' | 'comfortable';
export type AppFontPreference = 'small' | 'medium' | 'large' | 'extra-large';
export type ReaderPreferences = {
  fontSize: 'small' | 'medium' | 'large';
  lineHeight: 'compact' | 'comfortable' | 'relaxed';
  paragraphSpacing: 'tight' | 'normal' | 'wide';
  fontFamily: 'serif' | 'sans';
  fontWeight: 'regular' | 'medium';
  pageMargin: 'narrow' | 'normal' | 'wide';
  alignment: 'left' | 'justify';
  indent: boolean;
  hyphenation: boolean;
  dropCap: boolean;
  keepAwake: boolean;
  colorScheme: 'system' | 'light' | 'sepia' | 'dark';
  brightness: number;
};
type ResolvedTheme = 'dark' | 'light';
type ThemeValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  accent: AccentPreference;
  density: DensityPreference;
  appFont: AppFontPreference;
  reader: ReaderPreferences;
  setTheme: (value: ThemePreference) => void;
  setAccent: (value: AccentPreference) => void;
  setDensity: (value: DensityPreference) => void;
  setAppFont: (value: AppFontPreference) => void;
  setReader: (
    value: ReaderPreferences | ((current: ReaderPreferences) => ReaderPreferences)
  ) => void;
};
const ThemeContext = createContext<ThemeValue | null>(null);
const themeColors: Record<ResolvedTheme, string> = { dark: '#0f1115', light: '#f8f9fc' };
export const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 'medium',
  lineHeight: 'comfortable',
  paragraphSpacing: 'normal',
  fontFamily: 'serif',
  fontWeight: 'regular',
  pageMargin: 'normal',
  alignment: 'left',
  indent: false,
  hyphenation: false,
  dropCap: false,
  keepAwake: false,
  colorScheme: 'system',
  brightness: 100
};
function resolveTheme(theme: ThemePreference): ResolvedTheme {
  return theme !== 'system'
    ? theme
    : window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
}
function readReader(): ReaderPreferences {
  try {
    return {
      ...defaultReaderPreferences,
      ...JSON.parse(localStorage.getItem('novel-tool-reader') ?? '{}')
    };
  } catch {
    return defaultReaderPreferences;
  }
}
function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', themeColors[resolved]);
}
function applyReader(reader: ReaderPreferences) {
  const root = document.documentElement;
  root.dataset.readerFont = reader.fontSize;
  root.dataset.readerLine = reader.lineHeight;
  root.dataset.readerParagraph = reader.paragraphSpacing;
  root.dataset.readerFamily = reader.fontFamily;
  root.dataset.readerWeight = reader.fontWeight;
  root.dataset.readerMargin = reader.pageMargin;
  root.dataset.readerAlign = reader.alignment;
  root.dataset.readerIndent = String(reader.indent);
  root.dataset.readerHyphen = String(reader.hyphenation);
  root.dataset.readerDropcap = String(reader.dropCap);
  root.dataset.readerTheme = reader.colorScheme;
  root.style.setProperty(
    '--reader-dim-opacity',
    String(Math.max(0, Math.min(0.55, ((100 - reader.brightness) / 100) * 0.55)))
  );
}
export function ThemeProvider({ children }: { children: ReactNode }) {
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
  const [reader, setReaderState] = useState<ReaderPreferences>(readReader);
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
  useEffect(() => {
    applyReader(reader);
    localStorage.setItem('novel-tool-reader', JSON.stringify(reader));
  }, [reader]);
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
      reader,
      setTheme,
      setAccent: setAccentState,
      setDensity: setDensityState,
      setAppFont: setAppFontState,
      setReader: setReaderState
    }),
    [theme, resolvedTheme, accent, density, appFont, reader]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
