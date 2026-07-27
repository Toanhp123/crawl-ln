import { Minus, Plus, RotateCcw, SunMedium } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, Drawer, IconButton, SegmentedControl, Switch } from '../../../shared/ui';
import { useReaderPreferences } from '../model/ReaderPreferencesProvider';
import { defaultReaderPreferences, type ReaderPreferences } from '../model/preferences';

export function ReaderPreferencesSheet({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { t, number } = useI18n();
  const { preferences, setPreferences } = useReaderPreferences();
  const update = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) =>
    setPreferences((current) => ({ ...current, [key]: value }));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('settings.reader')}
      description={t('settings.readerDescription')}
    >
      <div className="space-y-5 pb-2">
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg p-4">
          <p className="reader-prose-preview text-text">{t('reader.previewText')}</p>
        </div>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.appearance')}
          <SegmentedControl
            value={preferences.colorScheme}
            items={[
              { id: 'system', label: t('settings.theme.system') },
              { id: 'light', label: t('settings.theme.light') },
              { id: 'sepia', label: t('settings.theme.sepia') },
              { id: 'dark', label: t('settings.theme.dark') }
            ]}
            onChange={(value) => update('colorScheme', value)}
            columns="auto"
            ariaLabel={t('settings.appearance')}
          />
        </label>
        <div className="grid gap-2">
          <div className="flex items-center justify-between type-label font-bold">
            <span className="inline-flex items-center gap-2">
              <SunMedium size={17} />
              {t('settings.brightness')}
            </span>
            <span>{number(preferences.brightness)}%</span>
          </div>
          <input
            aria-label={t('settings.brightness')}
            type="range"
            min="45"
            max="100"
            step="5"
            value={preferences.brightness}
            onChange={(event) => update('brightness', Number(event.target.value))}
            className="h-11 w-full accent-[hsl(var(--color-primary))]"
          />
        </div>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.fontFamily')}
          <SegmentedControl
            value={preferences.fontFamily}
            items={[
              { id: 'serif', label: t('settings.value.serif') },
              { id: 'sans', label: t('settings.value.sans') }
            ]}
            onChange={(value) => update('fontFamily', value)}
            columns={2}
            ariaLabel={t('settings.fontFamily')}
          />
        </label>
        <div className="grid gap-2">
          <span className="type-label font-bold">{t('settings.fontSize')}</span>
          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
            <IconButton
              variant="ghost"
              aria-label={t('reader.decreaseFont')}
              onClick={() =>
                update('fontSize', preferences.fontSize === 'large' ? 'medium' : 'small')
              }
              disabled={preferences.fontSize === 'small'}
            >
              <Minus size={18} />
            </IconButton>
            <div className="rounded-[var(--radius-md)] bg-surface2 py-3 text-center type-label font-bold">
              {t(`settings.value.${preferences.fontSize}`)}
            </div>
            <IconButton
              variant="ghost"
              aria-label={t('reader.increaseFont')}
              onClick={() =>
                update('fontSize', preferences.fontSize === 'small' ? 'medium' : 'large')
              }
              disabled={preferences.fontSize === 'large'}
            >
              <Plus size={18} />
            </IconButton>
          </div>
        </div>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.lineHeight')}
          <SegmentedControl
            value={preferences.lineHeight}
            items={[
              { id: 'compact', label: t('settings.value.compact') },
              { id: 'comfortable', label: t('settings.value.comfortable') },
              { id: 'relaxed', label: t('settings.value.relaxed') }
            ]}
            onChange={(value) => update('lineHeight', value)}
            columns={3}
            ariaLabel={t('settings.lineHeight')}
          />
        </label>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.paragraphSpacing')}
          <SegmentedControl
            value={preferences.paragraphSpacing}
            items={[
              { id: 'tight', label: t('settings.value.tight') },
              { id: 'normal', label: t('settings.value.normal') },
              { id: 'wide', label: t('settings.value.wide') }
            ]}
            onChange={(value) => update('paragraphSpacing', value)}
            columns={3}
            ariaLabel={t('settings.paragraphSpacing')}
          />
        </label>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.contentWidth')}
          <SegmentedControl
            value={preferences.pageMargin}
            items={[
              { id: 'narrow', label: t('settings.value.wide') },
              { id: 'normal', label: t('settings.value.normal') },
              { id: 'wide', label: t('settings.value.narrow') }
            ]}
            onChange={(value) => update('pageMargin', value)}
            columns={3}
            ariaLabel={t('settings.contentWidth')}
          />
        </label>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.alignment')}
          <SegmentedControl
            value={preferences.alignment}
            items={[
              { id: 'left', label: t('settings.value.left') },
              { id: 'justify', label: t('settings.value.justify') }
            ]}
            onChange={(value) => update('alignment', value)}
            columns={2}
            ariaLabel={t('settings.alignment')}
          />
        </label>
        <label className="grid gap-2 type-label font-bold">
          {t('settings.fontWeight')}
          <SegmentedControl
            value={preferences.fontWeight}
            items={[
              { id: 'regular', label: t('settings.value.regular') },
              { id: 'medium', label: t('settings.value.medium') }
            ]}
            onChange={(value) => update('fontWeight', value)}
            columns={2}
            ariaLabel={t('settings.fontWeight')}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Switch
            label={t('settings.indent')}
            checked={preferences.indent}
            onCheckedChange={(value) => update('indent', value)}
          />
          <Switch
            label={t('settings.hyphenation')}
            checked={preferences.hyphenation}
            onCheckedChange={(value) => update('hyphenation', value)}
          />
          <Switch
            label={t('settings.dropCap')}
            checked={preferences.dropCap}
            onCheckedChange={(value) => update('dropCap', value)}
          />
          <Switch
            label={t('settings.keepAwake')}
            checked={preferences.keepAwake}
            onCheckedChange={(value) => update('keepAwake', value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setPreferences(defaultReaderPreferences)}>
            <RotateCcw size={17} />
            {t('common.reset')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        </div>
      </div>
    </Drawer>
  );
}
