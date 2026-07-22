import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '@/shared/api/errors';
import { en } from './locales/en';
import { vi } from './locales/vi';

export type Language = 'vi' | 'en';
export type TranslationKey = keyof typeof en;
const dictionaries = { vi, en };
type Params = Record<string, string | number>;
type I18nValue = {
  language: Language;
  setLanguage: (value: Language) => void;
  t: (key: TranslationKey, params?: Params) => string;
  status: (value: string) => string;
  errorMessage: (error: unknown, fallbackKey?: TranslationKey) => string;
  number: (value: number) => string;
  date: (value: string | number | Date) => string;
  relativeTime: (value: string | number | Date) => string;
  plural: (count: number, one: TranslationKey, other: TranslationKey, params?: Params) => string;
};
const I18nContext = createContext<I18nValue | null>(null);
function interpolate(value: string, params?: Params) {
  return params
    ? value.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
    : value;
}

const codeKeys: Record<string, TranslationKey> = {
  NOT_FOUND: 'errors.notFound',
  VALIDATION_ERROR: 'errors.validation',
  BAD_REQUEST: 'errors.validation',
  FORBIDDEN: 'errors.forbidden',
  CONFLICT: 'errors.conflict',
  INTERNAL_ERROR: 'errors.internal'
};
function messageKey(error: unknown): TranslationKey | undefined {
  if (error instanceof ApiError && error.code && codeKeys[error.code]) return codeKeys[error.code];
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/chapter content selector returned too little text/i.test(raw))
    return 'errors.chapterContentTooShort';
  if (/network|failed to fetch|load failed|econn|enotfound|timeout/i.test(raw))
    return 'errors.network';
  if (/not found/i.test(raw)) return 'errors.notFound';
  return undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() =>
    localStorage.getItem('novel-tool-language') === 'en' ? 'en' : 'vi'
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const setLanguage = (value: Language) => {
    localStorage.setItem('novel-tool-language', value);
    setLanguageState(value);
  };
  const value = useMemo<I18nValue>(() => {
    const locale = language === 'vi' ? 'vi-VN' : 'en-US';
    const numberFormatter = new Intl.NumberFormat(locale);
    const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const relativeTimeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const t = (key: TranslationKey, params?: Params) =>
      interpolate(dictionaries[language][key], params);
    return {
      language,
      setLanguage,
      t,
      status: (raw) => dictionaries[language][`common.status.${raw}` as TranslationKey] ?? raw,
      errorMessage: (error, fallbackKey = 'errors.requestFailed') =>
        t(messageKey(error) ?? fallbackKey),
      number: (input) => numberFormatter.format(input),
      date: (input) => dateFormatter.format(new Date(input)),
      relativeTime: (input) => {
        const seconds = Math.round((new Date(input).getTime() - Date.now()) / 1000);
        const abs = Math.abs(seconds);
        const [value, unit] =
          abs < 60
            ? [seconds, 'second']
            : abs < 3600
              ? [Math.round(seconds / 60), 'minute']
              : abs < 86400
                ? [Math.round(seconds / 3600), 'hour']
                : [Math.round(seconds / 86400), 'day'];
        return relativeTimeFormatter.format(value, unit as Intl.RelativeTimeFormatUnit);
      },
      plural: (count, one, other, params) => t(count === 1 ? one : other, { ...params, count })
    };
  }, [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
