import { useI18n } from '../../../shared/i18n';
import { Card, SettingsChoiceGroup, Stack, Text } from '../../../shared/ui';
import { useAppFontConfiguration } from '../model/use-app-font-configuration';

export function AppFontControls() {
  const model = useAppFontConfiguration();
  const { t } = useI18n();

  return (
    <Stack gap="md">
      <Card elevation="flat" className="space-y-2" data-app-font-preview="">
        <Text as="h3" variant="title">
          {t('appFont.previewTitle')}
        </Text>
        <Text as="p" variant="body" tone="secondary">
          {t('appFont.previewBody')}
        </Text>
      </Card>
      <Text variant="supporting" tone="muted">
        {t('appFont.description')}
      </Text>
      <SettingsChoiceGroup
        label={t('appFont.choiceLabel')}
        value={model.appFont}
        items={model.items}
        layout="balanced"
        onChange={model.setAppFont}
      />
    </Stack>
  );
}
