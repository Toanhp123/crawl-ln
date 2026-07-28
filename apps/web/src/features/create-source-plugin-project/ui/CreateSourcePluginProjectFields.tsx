import { useI18n } from '../../../shared/i18n';
import { Field, Input, Section } from '../../../shared/ui';
import type { CreateSourcePluginProjectDraft } from '../model/use-create-source-plugin-project-draft';
import { SourcePluginProjectCapabilityPicker } from './SourcePluginProjectCapabilityPicker';

export function CreateSourcePluginProjectFields({
  draft,
  layout = 'modal'
}: {
  draft: CreateSourcePluginProjectDraft;
  layout?: 'modal' | 'page';
}) {
  const { t } = useI18n();

  return (
    <div
      className={
        layout === 'page'
          ? 'grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]'
          : 'grid gap-5 lg:grid-cols-2'
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('createSourcePluginProject.name')}>
            <Input
              value={draft.name}
              onChange={(event) => draft.setName(event.target.value)}
              disabled={draft.isPending}
              required
            />
          </Field>
          <Field label={t('createSourcePluginProject.pluginId')}>
            <Input
              value={draft.pluginId}
              onChange={(event) => draft.setPluginId(event.target.value)}
              disabled={draft.isPending}
              required
            />
          </Field>
          <Field label={t('createSourcePluginProject.version')}>
            <Input
              value={draft.version}
              onChange={(event) => draft.setVersion(event.target.value)}
              disabled={draft.isPending}
              required
            />
          </Field>
          <Field
            label={t('createSourcePluginProject.hosts')}
            hint={t('createSourcePluginProject.hostsHint')}
          >
            <Input
              value={draft.hosts}
              onChange={(event) => draft.setHosts(event.target.value)}
              disabled={draft.isPending}
              required
            />
          </Field>
        </div>

        <Section title={t('createSourcePluginProject.selectors')}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t('createSourcePluginProject.titleSelector')}>
              <Input
                value={draft.titleSelector}
                onChange={(event) => draft.setTitleSelector(event.target.value)}
                disabled={draft.isPending}
              />
            </Field>
            <Field label={t('createSourcePluginProject.chapterListSelector')}>
              <Input
                value={draft.chapterListSelector}
                onChange={(event) => draft.setChapterListSelector(event.target.value)}
                disabled={draft.isPending}
              />
            </Field>
            <Field label={t('createSourcePluginProject.chapterContentSelector')}>
              <Input
                value={draft.chapterContentSelector}
                onChange={(event) => draft.setChapterContentSelector(event.target.value)}
                disabled={draft.isPending}
              />
            </Field>
          </div>
        </Section>
      </div>

      <Section
        title={t('createSourcePluginProject.capabilities')}
        className="rounded-[var(--radius-lg)] border border-border bg-surface2 p-4"
      >
        <SourcePluginProjectCapabilityPicker
          value={draft.capabilities}
          onChange={draft.setCapabilities}
          disabled={draft.isPending}
        />
      </Section>
    </div>
  );
}
