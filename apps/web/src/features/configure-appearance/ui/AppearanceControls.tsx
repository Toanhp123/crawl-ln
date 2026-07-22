import { useI18n } from '../../../shared/i18n';
import { SegmentedControl, Stack, Text } from '../../../shared/ui';
import { useAppearanceConfiguration } from '../model/use-appearance-configuration';

export function AppearanceControls() {
  const model = useAppearanceConfiguration();
  const { t } = useI18n();
  return (
    <Stack gap="md">
      <div>
        <Text variant="label" className="mb-2 block">
          {t('appearance.theme')}
        </Text>
        <SegmentedControl
          value={model.theme}
          ariaLabel={t('appearance.theme')}
          items={(['system', 'dark', 'light'] as const).map((id) => ({
            id,
            label: t(`appearance.${id}`)
          }))}
          onChange={model.setTheme}
        />
      </div>
      <div>
        <Text variant="label" className="mb-2 block">
          {t('appearance.accent')}
        </Text>
        <SegmentedControl
          value={model.accent}
          columns={4}
          ariaLabel={t('appearance.accent')}
          items={(['indigo', 'blue', 'emerald', 'amber'] as const).map((id) => ({
            id,
            label: t(`appearance.${id}`)
          }))}
          onChange={model.setAccent}
        />
      </div>
      <div>
        <Text variant="label" className="mb-2 block">
          {t('appearance.density')}
        </Text>
        <SegmentedControl
          value={model.density}
          columns={2}
          ariaLabel={t('appearance.density')}
          items={(['compact', 'comfortable'] as const).map((id) => ({
            id,
            label: t(`appearance.${id}`)
          }))}
          onChange={model.setDensity}
        />
      </div>
      <div>
        <Text variant="label" className="mb-2 block">
          {t('appearance.font')}
        </Text>
        <SegmentedControl
          value={model.appFont}
          columns={4}
          ariaLabel={t('appearance.font')}
          items={(['small', 'medium', 'large', 'extra-large'] as const).map((id) => ({
            id,
            label: t(`appearance.${id}`)
          }))}
          onChange={model.setAppFont}
        />
      </div>
    </Stack>
  );
}
