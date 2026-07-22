import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSchedulerStatus, runSchedulerTick } from '@/features/auto-update/api/autoUpdate';
import { queryKeys } from '@/shared/api/queryKeys';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';
import { useI18n, type Language, type TranslationKey } from '@/shared/i18n/I18nProvider';
import {
  useTheme,
  type AccentPreference,
  type AppFontPreference,
  type DensityPreference,
  type ReaderPreferences,
  type ThemePreference
} from '@/shared/theme/runtime/ThemeProvider';

export type SettingsOption<T extends string> = { id: T; label: string; icon?: ReactNode };

export function useSettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    density,
    setDensity,
    appFont,
    setAppFont,
    reader,
    setReader
  } = useTheme();
  const queryClient = useQueryClient();
  const realtimeStatus = useRealtimeStatus();
  const scheduler = useQuery({
    queryKey: queryKeys.schedulerStatus,
    queryFn: ({ signal }) => getSchedulerStatus(signal),
    refetchInterval: () => getRealtimePollingInterval(realtimeStatus, true, 15_000)
  });
  const runScheduler = useMutation({
    mutationFn: runSchedulerTick,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.schedulerStatus })
  });

  const valueLabel = (value: string) => t(`settings.value.${value}` as TranslationKey);

  const updateReader = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => {
    setReader((current) => ({ ...current, [key]: value }));
  };

  const themes: SettingsOption<ThemePreference>[] = [
    { id: 'system', icon: <Monitor size={16} />, label: t('settings.theme.system') },
    { id: 'dark', icon: <Moon size={16} />, label: t('settings.theme.dark') },
    { id: 'light', icon: <Sun size={16} />, label: t('settings.theme.light') }
  ];

  const accents: SettingsOption<AccentPreference>[] = (
    ['indigo', 'blue', 'emerald', 'amber'] as const
  ).map((id) => ({ id, label: t(`settings.accent.${id}` as TranslationKey) }));

  const densities: SettingsOption<DensityPreference>[] = (['compact', 'comfortable'] as const).map(
    (id) => ({ id, label: t(`settings.density.${id}` as TranslationKey) })
  );

  const appFonts: SettingsOption<AppFontPreference>[] = (
    ['small', 'medium', 'large', 'extra-large'] as const
  ).map((id) => ({ id, label: valueLabel(id) }));

  const languages: SettingsOption<Language>[] = [
    { id: 'en', label: t('settings.language.en') },
    { id: 'vi', label: t('settings.language.vi') }
  ];

  return {
    t,
    theme,
    setTheme,
    accent,
    setAccent,
    density,
    setDensity,
    appFont,
    setAppFont,
    language,
    setLanguage,
    reader,
    themes,
    accents,
    densities,
    appFonts,
    appFontIndex: appFonts.findIndex((item) => item.id === appFont),
    languages,
    valueLabel,
    updateReader,
    scheduler,
    runScheduler
  };
}

export type SettingsPageModel = ReturnType<typeof useSettingsPage>;
