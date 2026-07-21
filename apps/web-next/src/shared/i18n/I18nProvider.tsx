import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getErrorMessage } from '../api/errors';
import { genericCatalogs, mergeCatalogs, type Catalog } from './catalog';

export type Language = keyof typeof genericCatalogs;
export type TranslationKey = string;
type Params = Record<string, string | number>;
type ErrorInterpreter = (error: unknown) => string | undefined;

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

function interpolate(value: string, params?: Params): string {
  return params
    ? value.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
    : value;
}

export function I18nProvider({
  children,
  catalogs,
  interpretError
}: {
  children: ReactNode;
  catalogs?: Partial<Record<Language, Catalog>>;
  interpretError?: ErrorInterpreter;
}) {
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
    const catalog = mergeCatalogs(genericCatalogs[language], catalogs?.[language] ?? {});
    const numberFormatter = new Intl.NumberFormat(locale);
    const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const relativeTimeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const t = (key: TranslationKey, params?: Params) => interpolate(catalog[key] ?? key, params);

    return {
      language,
      setLanguage,
      t,
      status: (raw) => catalog[`common.status.${raw}`] ?? raw,
      errorMessage: (error, fallbackKey = 'common.requestFailed') =>
        (interpretError?.(error) ?? getErrorMessage(error)) || t(fallbackKey),
      number: (input) => numberFormatter.format(input),
      date: (input) => dateFormatter.format(new Date(input)),
      relativeTime: (input) => {
        const seconds = Math.round((new Date(input).getTime() - Date.now()) / 1000);
        const absolute = Math.abs(seconds);
        const [amount, unit] =
          absolute < 60
            ? [seconds, 'second']
            : absolute < 3600
              ? [Math.round(seconds / 60), 'minute']
              : absolute < 86400
                ? [Math.round(seconds / 3600), 'hour']
                : [Math.round(seconds / 86400), 'day'];
        return relativeTimeFormatter.format(amount, unit as Intl.RelativeTimeFormatUnit);
      },
      plural: (count, one, other, params) => t(count === 1 ? one : other, { ...params, count })
    };
  }, [catalogs, interpretError, language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
