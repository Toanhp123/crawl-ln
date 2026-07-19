import type { ReaderPreferences } from '@/shared/theme/runtime/ThemeProvider';
import { SegmentedControl, Surface, Switch, Text } from '@/shared/ui';
import type { TranslationKey } from '@/shared/i18n/I18nProvider';

export function ReaderSettingsControls({
  reader,
  update,
  t
}: {
  reader: ReaderPreferences;
  update: <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-5">
      <label className="grid gap-2">
        <Text variant="label">{t('settings.fontFamily')}</Text>
        <SegmentedControl
          value={reader.fontFamily}
          columns={2}
          ariaLabel={t('settings.fontFamily')}
          items={[
            { id: 'serif', label: t('settings.value.serif') },
            { id: 'sans', label: t('settings.value.sans') }
          ]}
          onChange={(value) => update('fontFamily', value)}
        />
      </label>
      <label className="grid gap-2">
        <Text variant="label">{t('settings.fontSize')}</Text>
        <SegmentedControl
          value={reader.fontSize}
          columns={3}
          ariaLabel={t('settings.fontSize')}
          items={[
            { id: 'small', label: t('settings.value.small') },
            { id: 'medium', label: t('settings.value.medium') },
            { id: 'large', label: t('settings.value.large') }
          ]}
          onChange={(value) => update('fontSize', value)}
        />
      </label>
      <label className="grid gap-2">
        <Text variant="label">{t('settings.lineHeight')}</Text>
        <SegmentedControl
          value={reader.lineHeight}
          columns={3}
          ariaLabel={t('settings.lineHeight')}
          items={[
            { id: 'compact', label: t('settings.value.compact') },
            { id: 'comfortable', label: t('settings.value.comfortable') },
            { id: 'relaxed', label: t('settings.value.relaxed') }
          ]}
          onChange={(value) => update('lineHeight', value)}
        />
      </label>
      <label className="grid gap-2">
        <Text variant="label">{t('settings.paragraphSpacing')}</Text>
        <SegmentedControl
          value={reader.paragraphSpacing}
          columns={3}
          ariaLabel={t('settings.paragraphSpacing')}
          items={[
            { id: 'tight', label: t('settings.value.tight') },
            { id: 'normal', label: t('settings.value.normal') },
            { id: 'wide', label: t('settings.value.wide') }
          ]}
          onChange={(value) => update('paragraphSpacing', value)}
        />
      </label>
      <label className="grid gap-2">
        <Text variant="label">{t('settings.pageMargin')}</Text>
        <SegmentedControl
          value={reader.pageMargin}
          columns={3}
          ariaLabel={t('settings.pageMargin')}
          items={[
            { id: 'narrow', label: t('settings.value.narrow') },
            { id: 'normal', label: t('settings.value.normal') },
            { id: 'wide', label: t('settings.value.wide') }
          ]}
          onChange={(value) => update('pageMargin', value)}
        />
      </label>
      <label className="grid gap-2">
        <Text variant="label">{t('settings.alignment')}</Text>
        <SegmentedControl
          value={reader.alignment}
          columns={2}
          ariaLabel={t('settings.alignment')}
          items={[
            { id: 'left', label: t('settings.value.left') },
            { id: 'justify', label: t('settings.value.justify') }
          ]}
          onChange={(value) => update('alignment', value)}
        />
      </label>
      <label className="grid gap-2">
        <Text variant="label">{t('settings.fontWeight')}</Text>
        <SegmentedControl
          value={reader.fontWeight}
          columns={2}
          ariaLabel={t('settings.fontWeight')}
          items={[
            { id: 'regular', label: t('settings.value.regular') },
            { id: 'medium', label: t('settings.value.medium') }
          ]}
          onChange={(value) => update('fontWeight', value)}
        />
      </label>
      <Surface className="overflow-hidden p-0">
        <Switch
          label={t('settings.indent')}
          bordered
          checked={reader.indent}
          onCheckedChange={(value) => update('indent', value)}
        />
        <Switch
          label={t('settings.hyphenation')}
          bordered
          checked={reader.hyphenation}
          onCheckedChange={(value) => update('hyphenation', value)}
        />
        <Switch
          label={t('settings.dropCap')}
          bordered
          checked={reader.dropCap}
          onCheckedChange={(value) => update('dropCap', value)}
        />
        <Switch
          label={t('settings.keepAwake')}
          bordered
          checked={reader.keepAwake}
          onCheckedChange={(value) => update('keepAwake', value)}
        />
      </Surface>
    </div>
  );
}
