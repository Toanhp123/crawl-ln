import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { Braces, Download, FlaskConical, Hammer, PackageCheck, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  SourcePluginProject,
  SourcePluginStudioCapability
} from '@/entities/source-plugin-project';
import {
  buildSourcePluginProject,
  createSourcePluginProject,
  exportSourcePluginProject,
  installSourcePluginProject,
  testSourcePluginProject,
  updateSourcePluginProject
} from '@/features/manage-source-plugin-project';
import { getPublicErrorDescription, saveDownloadArtifact } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { Badge, Button, Field, Input, Panel } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

loader.config({ monaco });

const capabilities: Array<{ id: SourcePluginStudioCapability; label: string }> = [
  { id: 'identify', label: 'Identify URL' },
  { id: 'metadata', label: 'Novel metadata' },
  { id: 'chapter-list', label: 'Chapter list' },
  { id: 'chapter-content', label: 'Chapter content' }
];

function languageFor(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  return 'typescript';
}

export function SourcePluginStudio() {
  const { t } = useI18n();
  const [project, setProject] = useState<SourcePluginProject>();
  const [name, setName] = useState('My Source');
  const [pluginId, setPluginId] = useState('my-source');
  const [version, setVersion] = useState('1.0.0');
  const [host, setHost] = useState('example.com');
  const [selectedCapabilities, setSelectedCapabilities] = useState<SourcePluginStudioCapability[]>([
    'identify',
    'metadata',
    'chapter-list',
    'chapter-content'
  ]);
  const [titleSelector, setTitleSelector] = useState('title');
  const [chapterListSelector, setChapterListSelector] = useState('a[href]');
  const [chapterContentSelector, setChapterContentSelector] = useState('article');
  const [selectedFile, setSelectedFile] = useState('src/index.ts');
  const [busy, setBusy] = useState<string>();
  const [output, setOutput] = useState(t('pluginStudio.ready'));
  const [error, setError] = useState<string>();
  const [builtRevision, setBuiltRevision] = useState<number>();
  const dirtyRef = useRef(false);
  const revisionRef = useRef(1);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const fileNames = useMemo(() => Object.keys(project?.files ?? {}).sort(), [project?.files]);
  const buildCurrent = Boolean(project && builtRevision === project.revision);

  useEffect(() => {
    if (!project || !dirtyRef.current) return;
    const snapshot = project.files;
    const projectId = project.id;
    const timer = window.setTimeout(() => {
      dirtyRef.current = false;
      setOutput(t('pluginStudio.saving'));
      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          const saved = await updateSourcePluginProject(projectId, {
            expectedRevision: revisionRef.current,
            files: snapshot
          });
          revisionRef.current = saved.revision;
          setProject(saved);
          setBuiltRevision(undefined);
          setOutput(t('pluginStudio.saved'));
        })
        .catch((reason) => {
          dirtyRef.current = true;
          setError(getPublicErrorDescription(reason));
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [project, t]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    setError(undefined);
    try {
      const result = await action();
      setOutput(JSON.stringify(result, null, 2));
      return result;
    } catch (reason) {
      setError(getPublicErrorDescription(reason));
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };

  const createWorkspace = async () => {
    const created = (await run('create', () =>
      createSourcePluginProject({
        name,
        pluginId,
        version,
        hosts: host
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        capabilities: selectedCapabilities,
        selectors: {
          title: titleSelector,
          chapterList: chapterListSelector,
          chapterContent: chapterContentSelector
        }
      })
    )) as SourcePluginProject | undefined;
    if (!created) return;
    revisionRef.current = created.revision;
    setProject(created);
    setSelectedFile(
      created.files['src/index.ts'] ? 'src/index.ts' : Object.keys(created.files)[0]!
    );
  };

  const changeCapability = (capability: SourcePluginStudioCapability) => {
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability]
    );
  };

  if (!project) {
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <Panel
          className="relative overflow-hidden border-[hsl(178_48%_35%/0.35)] bg-[linear-gradient(145deg,hsl(var(--color-bg-elevated)),hsl(178_36%_96%))] dark:bg-[linear-gradient(145deg,hsl(var(--color-bg-elevated)),hsl(178_28%_12%))]"
          padding="lg"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[hsl(42_95%_58%/0.18)] blur-3xl" />
          <div className="relative space-y-5">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(178_54%_28%)] text-white">
                <Sparkles size={21} />
              </div>
              <div>
                <h2 className="type-section-title">Scaffold a clean SDK plugin</h2>
                <p className="mt-1 type-supporting text-secondary">
                  No npm install, no ambient Node access, isolated runtime by default.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Plugin name">
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Plugin ID">
                <Input value={pluginId} onChange={(event) => setPluginId(event.target.value)} />
              </Field>
              <Field label="Version">
                <Input value={version} onChange={(event) => setVersion(event.target.value)} />
              </Field>
              <Field label="Source domain" hint="Comma-separated hostnames">
                <Input value={host} onChange={(event) => setHost(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Title selector">
                <Input
                  value={titleSelector}
                  onChange={(event) => setTitleSelector(event.target.value)}
                />
              </Field>
              <Field label="Chapter links">
                <Input
                  value={chapterListSelector}
                  onChange={(event) => setChapterListSelector(event.target.value)}
                />
              </Field>
              <Field label="Chapter content">
                <Input
                  value={chapterContentSelector}
                  onChange={(event) => setChapterContentSelector(event.target.value)}
                />
              </Field>
            </div>
            {error ? (
              <p className="rounded-xl border border-danger-state-border bg-danger-subtle px-3 py-2 type-supporting text-danger">
                {error}
              </p>
            ) : null}
            <Button
              onClick={() => void createWorkspace()}
              disabled={busy === 'create' || selectedCapabilities.length === 0}
              leadingIcon={<Braces size={18} />}
            >
              {t('pluginStudio.create')}
            </Button>
          </div>
        </Panel>
        <Panel padding="lg" className="space-y-4">
          <p className="type-eyebrow text-primary">Capabilities</p>
          <div className="space-y-2">
            {capabilities.map((capability) => {
              const checked = selectedCapabilities.includes(capability.id);
              return (
                <label
                  key={capability.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors',
                    checked
                      ? 'border-[hsl(178_54%_35%)] bg-[hsl(178_48%_92%)] dark:bg-[hsl(178_32%_16%)]'
                      : 'border-border bg-surface hover:border-border-strong'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => changeCapability(capability.id)}
                    className="h-4 w-4 accent-[hsl(178_54%_32%)]"
                  />
                  <span className="type-body-sm">{capability.label}</span>
                </label>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(215_18%_26%)] bg-[hsl(218_24%_10%)] text-[hsl(210_20%_92%)] shadow-[0_24px_70px_hsl(220_35%_4%/0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(215_17%_22%)] bg-[hsl(218_22%_13%)] px-3 py-2.5 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(42_92%_55%)] text-[hsl(220_30%_10%)]">
            <Braces size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate type-label text-white">{project.name}</p>
            <p className="truncate text-xs text-[hsl(214_14%_64%)]">
              {project.pluginId}@{project.version} · rev {project.revision}
            </p>
          </div>
          <Badge tone={buildCurrent ? 'success' : 'warning'}>
            {buildCurrent ? 'build current' : 'build stale'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busy)}
            leadingIcon={<Hammer size={16} />}
            onClick={() =>
              void run('build', async () => {
                const result = (await buildSourcePluginProject(project.id)) as {
                  revision?: number;
                };
                setBuiltRevision(result.revision ?? project.revision);
                return result;
              })
            }
          >
            {t('pluginStudio.build')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busy)}
            leadingIcon={<FlaskConical size={16} />}
            onClick={() => void run('test', () => testSourcePluginProject(project.id))}
          >
            {t('pluginStudio.test')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busy) || !buildCurrent}
            leadingIcon={<Download size={16} />}
            onClick={() =>
              void run('export', async () => {
                const artifact = await exportSourcePluginProject(project.id);
                saveDownloadArtifact(artifact);
                return { filename: artifact.filename, bytes: artifact.content.byteLength };
              })
            }
          >
            {t('pluginStudio.export')}
          </Button>
          <Button
            size="sm"
            disabled={Boolean(busy) || !buildCurrent}
            leadingIcon={<PackageCheck size={16} />}
            onClick={() => void run('install', () => installSourcePluginProject(project.id))}
          >
            {t('pluginStudio.install')}
          </Button>
        </div>
      </div>
      <div className="grid min-h-[38rem] grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-[hsl(215_17%_22%)] bg-[hsl(218_22%_12%)] p-2 md:border-b-0 md:border-r">
          <p className="px-2 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[hsl(214_13%_58%)]">
            Project files
          </p>
          <div className="flex gap-1 overflow-x-auto md:block md:space-y-1 md:overflow-visible">
            {fileNames.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => setSelectedFile(file)}
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors md:block md:w-full',
                  selectedFile === file
                    ? 'bg-[hsl(178_48%_28%)] text-white'
                    : 'text-[hsl(214_15%_72%)] hover:bg-[hsl(217_18%_18%)]'
                )}
              >
                {file}
              </button>
            ))}
          </div>
        </aside>
        <div className="grid min-h-0 grid-rows-[minmax(28rem,1fr)_10rem]">
          <Editor
            height="100%"
            path={selectedFile}
            language={languageFor(selectedFile)}
            theme="vs-dark"
            value={project.files[selectedFile] ?? ''}
            onChange={(value) => {
              dirtyRef.current = true;
              setProject((current) =>
                current
                  ? { ...current, files: { ...current.files, [selectedFile]: value ?? '' } }
                  : current
              );
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineHeight: 22,
              padding: { top: 16 },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2
            }}
          />
          <div className="overflow-auto border-t border-[hsl(215_17%_22%)] bg-[hsl(220_25%_8%)] p-3 font-mono text-xs leading-5 text-[hsl(145_42%_72%)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[hsl(214_13%_58%)]">
                Studio output
              </span>
              {busy ? <span className="text-[hsl(42_92%_65%)]">{busy}...</span> : null}
            </div>
            {error ? (
              <pre className="whitespace-pre-wrap text-[hsl(4_80%_72%)]">{error}</pre>
            ) : (
              <pre className="whitespace-pre-wrap">{output}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
