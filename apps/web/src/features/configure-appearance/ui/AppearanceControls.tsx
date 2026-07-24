import { Monitor, Moon, Sun } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { SettingsChoiceGroup, Stack } from '../../../shared/ui';
import { useAppearanceConfiguration } from '../model/use-appearance-configuration';

const themeIcons = {
  system: <Monitor size={16} />,
  dark: <Moon size={16} />,
  light: <Sun size={16} />
} as const;

export function AppearanceControls() {
  const model = useAppearanceConfiguration();
  const { t } = useI18n();
  return (
    <Stack gap="lg">
      <SettingsChoiceGroup
        label={t('appearance.theme')}
        value={model.theme}
        items={model.themeItems.map((item) => ({ ...item, icon: themeIcons[item.id] }))}
        onChange={model.setTheme}
      />
      <SettingsChoiceGroup
        label={t('appearance.accent')}
        value={model.accent}
        items={model.accentItems}
        onChange={model.setAccent}
      />
      <SettingsChoiceGroup
        label={t('appearance.density')}
        value={model.density}
        items={model.densityItems}
        onChange={model.setDensity}
      />
    </Stack>
  );
}
