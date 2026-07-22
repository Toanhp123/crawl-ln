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

export const READER_PREFERENCES_STORAGE_KEY = 'novel-tool-reader';

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

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback;
}

export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const brightness =
    typeof input.brightness === 'number' && Number.isFinite(input.brightness)
      ? input.brightness
      : 100;
  return {
    fontSize: choice(input.fontSize, ['small', 'medium', 'large'], 'medium'),
    lineHeight: choice(input.lineHeight, ['compact', 'comfortable', 'relaxed'], 'comfortable'),
    paragraphSpacing: choice(input.paragraphSpacing, ['tight', 'normal', 'wide'], 'normal'),
    fontFamily: choice(input.fontFamily, ['serif', 'sans'], 'serif'),
    fontWeight: choice(input.fontWeight, ['regular', 'medium'], 'regular'),
    pageMargin: choice(input.pageMargin, ['narrow', 'normal', 'wide'], 'normal'),
    alignment: choice(input.alignment, ['left', 'justify'], 'left'),
    indent: input.indent === true,
    hyphenation: input.hyphenation === true,
    dropCap: input.dropCap === true,
    keepAwake: input.keepAwake === true,
    colorScheme: choice(input.colorScheme, ['system', 'light', 'sepia', 'dark'], 'system'),
    brightness: Math.max(45, Math.min(100, Math.round(brightness / 5) * 5))
  };
}

export function readReaderPreferences(storage?: Pick<Storage, 'getItem'>): ReaderPreferences {
  try {
    const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    const raw = target?.getItem(READER_PREFERENCES_STORAGE_KEY);
    return raw ? normalizeReaderPreferences(JSON.parse(raw)) : defaultReaderPreferences;
  } catch {
    return defaultReaderPreferences;
  }
}

export function writeReaderPreferences(
  preferences: ReaderPreferences,
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    target?.setItem(READER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are best-effort and must not block reading.
  }
}

export function applyReaderPreferences(
  preferences: ReaderPreferences,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.readerFont = preferences.fontSize;
  root.dataset.readerLine = preferences.lineHeight;
  root.dataset.readerParagraph = preferences.paragraphSpacing;
  root.dataset.readerFamily = preferences.fontFamily;
  root.dataset.readerWeight = preferences.fontWeight;
  root.dataset.readerMargin = preferences.pageMargin;
  root.dataset.readerAlign = preferences.alignment;
  root.dataset.readerIndent = String(preferences.indent);
  root.dataset.readerHyphen = String(preferences.hyphenation);
  root.dataset.readerDropcap = String(preferences.dropCap);
  root.dataset.readerTheme = preferences.colorScheme;
  root.style.setProperty(
    '--reader-dim-opacity',
    String(Math.max(0, Math.min(0.55, ((100 - preferences.brightness) / 100) * 0.55)))
  );
}
