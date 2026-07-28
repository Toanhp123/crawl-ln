import { useState, type FormEvent } from 'react';
import type {
  SourcePluginProject,
  SourcePluginStudioCapability
} from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { useCreateSourcePluginProject } from './use-create-source-plugin-project';

const DEFAULT_CAPABILITIES: SourcePluginStudioCapability[] = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
];

export function useCreateSourcePluginProjectDraft(
  onCreated: (project: SourcePluginProject) => void
) {
  const { t } = useI18n();
  const mutation = useCreateSourcePluginProject();
  const [name, setName] = useState(() => t('createSourcePluginProject.defaultName'));
  const [pluginId, setPluginId] = useState('my-source');
  const [version, setVersion] = useState('1.0.0');
  const [hosts, setHosts] = useState('example.com');
  const [capabilities, setCapabilities] =
    useState<SourcePluginStudioCapability[]>(DEFAULT_CAPABILITIES);
  const [titleSelector, setTitleSelector] = useState('title');
  const [chapterListSelector, setChapterListSelector] = useState('a[href]');
  const [chapterContentSelector, setChapterContentSelector] = useState('article');

  const reset = () => {
    setName(t('createSourcePluginProject.defaultName'));
    setPluginId('my-source');
    setVersion('1.0.0');
    setHosts('example.com');
    setCapabilities([...DEFAULT_CAPABILITIES]);
    setTitleSelector('title');
    setChapterListSelector('a[href]');
    setChapterContentSelector('article');
    mutation.reset();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate(
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

  return {
    name,
    setName,
    pluginId,
    setPluginId,
    version,
    setVersion,
    hosts,
    setHosts,
    capabilities,
    setCapabilities,
    titleSelector,
    setTitleSelector,
    chapterListSelector,
    setChapterListSelector,
    chapterContentSelector,
    setChapterContentSelector,
    submit,
    reset,
    canSubmit: capabilities.length > 0,
    status: mutation.status,
    isPending: mutation.isPending,
    error: mutation.error
  };
}

export type CreateSourcePluginProjectDraft = ReturnType<typeof useCreateSourcePluginProjectDraft>;
