import { Braces } from 'lucide-react';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, Panel, Stack } from '../../../shared/ui';
import { useCreateSourcePluginProjectDraft } from '../model/use-create-source-plugin-project-draft';
import { CreateSourcePluginProjectFields } from './CreateSourcePluginProjectFields';

export function CreateSourcePluginProjectForm({
  onCreated
}: {
  onCreated: (project: SourcePluginProject) => void;
}) {
  const { t } = useI18n();
  const draft = useCreateSourcePluginProjectDraft(onCreated);

  return (
    <form onSubmit={draft.submit}>
      <Panel tone="default" padding="lg">
        <Stack gap="lg">
          <CreateSourcePluginProjectFields draft={draft} layout="page" />
          <ErrorBanner error={draft.error} />
          <Button
            type="submit"
            actionState={draft.status}
            disabled={!draft.canSubmit}
            leadingIcon={<Braces size={18} />}
          >
            {t('createSourcePluginProject.action')}
          </Button>
        </Stack>
      </Panel>
    </form>
  );
}
