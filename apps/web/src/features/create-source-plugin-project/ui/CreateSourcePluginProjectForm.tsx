import { Braces } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type {
  SourcePluginProject,
  SourcePluginStudioCapability
} from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import {
  Button,
  ErrorBanner,
  Field,
  IconTile,
  Input,
  Panel,
  ResponsiveSplit,
  Section,
  Stack,
  Text
} from '../../../shared/ui';
import { useCreateSourcePluginProject } from '../model/use-create-source-plugin-project';
import { SourcePluginProjectCapabilityPicker } from './SourcePluginProjectCapabilityPicker';

const defaultCapabilities: SourcePluginStudioCapability[] = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
];

export function CreateSourcePluginProjectForm({
  onCreated
}: {
  onCreated: (project: SourcePluginProject) => void;
}) {
  const { t } = useI18n();
  const createProject = useCreateSourcePluginProject();
  const [name, setName] = useState(() => t('createSourcePluginProject.defaultName'));
  const [pluginId, setPluginId] = useState('my-source');
  const [version, setVersion] = useState('1.0.0');
  const [hosts, setHosts] = useState('example.com');
  const [capabilities, setCapabilities] =
    useState<SourcePluginStudioCapability[]>(defaultCapabilities);
  const [titleSelector, setTitleSelector] = useState('title');
  const [chapterListSelector, setChapterListSelector] = useState('a[href]');
  const [chapterContentSelector, setChapterContentSelector] = useState('article');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createProject.mutate(
      {
        name,
        pluginId,
        version,
        hosts: hosts
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        capabilities,
        selectors: {
          title: titleSelector,
          chapterList: chapterListSelector,
          chapterContent: chapterContentSelector
        }
      },
      { onSuccess: onCreated }
    );
  };

  return (
    <form onSubmit={submit}>
      <ResponsiveSplit>
        <Panel tone="default" padding="lg">
          <Stack gap="lg">
            <div className="flex items-start gap-3">
              <IconTile size="lg" tone="primary">
                <Braces size={20} />
              </IconTile>
              <div className="min-w-0">
                <Text as="h2" variant="sectionTitle">
                  {t('createSourcePluginProject.title')}
                </Text>
                <Text as="p" variant="supporting" tone="muted" className="mt-1 max-w-[56ch]">
                  {t('createSourcePluginProject.description')}
                </Text>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('createSourcePluginProject.name')}>
                <Input value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>
              <Field label={t('createSourcePluginProject.pluginId')}>
                <Input
                  value={pluginId}
                  onChange={(event) => setPluginId(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('createSourcePluginProject.version')}>
                <Input
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  required
                />
              </Field>
              <Field
                label={t('createSourcePluginProject.hosts')}
                hint={t('createSourcePluginProject.hostsHint')}
              >
                <Input value={hosts} onChange={(event) => setHosts(event.target.value)} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t('createSourcePluginProject.titleSelector')}>
                <Input
                  value={titleSelector}
                  onChange={(event) => setTitleSelector(event.target.value)}
                />
              </Field>
              <Field label={t('createSourcePluginProject.chapterListSelector')}>
                <Input
                  value={chapterListSelector}
                  onChange={(event) => setChapterListSelector(event.target.value)}
                />
              </Field>
              <Field label={t('createSourcePluginProject.chapterContentSelector')}>
                <Input
                  value={chapterContentSelector}
                  onChange={(event) => setChapterContentSelector(event.target.value)}
                />
              </Field>
            </div>
            <ErrorBanner error={createProject.error} />
            <Button
              type="submit"
              actionState={createProject.status}
              disabled={capabilities.length === 0}
              leadingIcon={<Braces size={18} />}
            >
              {t('createSourcePluginProject.action')}
            </Button>
          </Stack>
        </Panel>
        <Panel tone="inset" padding="lg">
          <Section title={t('createSourcePluginProject.capabilities')}>
            <SourcePluginProjectCapabilityPicker
              value={capabilities}
              onChange={setCapabilities}
              disabled={createProject.isPending}
            />
          </Section>
        </Panel>
      </ResponsiveSplit>
    </form>
  );
}
