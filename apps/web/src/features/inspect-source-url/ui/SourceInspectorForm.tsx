import type { SourceReaderInspectOperation } from '@novel-tool/shared';
import { Play, StepForward } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  FilterChip,
  Input,
  Panel,
  Switch
} from '@/shared/ui';
import { sourceInspectorOperations, type SourceInspectorFormState } from '../model/sourceInspector';
import type { SourceInspectorController } from '../model/useSourceInspector';
import { SourceReaderResultView } from './SourceReaderResultView';

export function SourceInspectorForm({ controller }: { controller: SourceInspectorController }) {
  const { t } = useI18n();
  const {
    form,
    update,
    selectOperation,
    credentials,
    profiles,
    mutation,
    run,
    canRun,
    nextCursor
  } = controller;
  const paginated =
    form.operation === 'chapter-list' ||
    form.operation === 'latest-updates' ||
    form.operation === 'search';
  const operationLabel: Record<SourceReaderInspectOperation, string> = useMemo(
    () => ({
      identify: t('sources.inspector.identify'),
      metadata: t('sources.inspector.metadata'),
      'chapter-list': t('sources.inspector.chapterList'),
      'chapter-content': t('sources.inspector.chapterContent'),
      search: t('sources.inspector.search'),
      'latest-updates': t('sources.inspector.latestUpdates')
    }),
    [t]
  );
  const change =
    <Key extends keyof SourceInspectorFormState>(key: Key) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      update(key, event.target.value as SourceInspectorFormState[Key]);

  return (
    <div className="space-y-4">
      <Field label={t('sources.inspector.operation')}>
        <div className="flex flex-wrap gap-2">
          {sourceInspectorOperations.map((operation) => (
            <FilterChip
              key={operation}
              selected={form.operation === operation}
              onClick={() => selectOperation(operation)}
            >
              {operationLabel[operation]}
            </FilterChip>
          ))}
        </div>
      </Field>
      <Field label={t('sources.inspector.url')}>
        <Input
          type="url"
          value={form.url}
          placeholder="https://example.com/novel"
          onChange={change('url')}
        />
      </Field>
      {form.operation === 'search' ? (
        <Field label={t('sources.inspector.query')}>
          <Input value={form.query} onChange={change('query')} />
        </Field>
      ) : null}
      {paginated ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('sources.inspector.cursor')} hint={t('sources.common.optional')}>
            <Input value={form.cursor} onChange={change('cursor')} />
          </Field>
          <Field label={t('sources.inspector.limit')}>
            <Input
              type="number"
              min={1}
              max={form.operation === 'search' ? 100 : 500}
              value={form.limit}
              onChange={change('limit')}
            />
          </Field>
        </div>
      ) : null}
      <Panel tone="inset" className="space-y-3">
        <Field label={t('sources.inspector.credential')}>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={!form.credentialProfileId}
              onClick={() => update('credentialProfileId', undefined)}
            >
              {t('sources.inspector.none')}
            </FilterChip>
            {credentials.data
              ?.filter((item) => item.enabled)
              .map((item) => (
                <FilterChip
                  key={item.id}
                  selected={form.credentialProfileId === item.id}
                  onClick={() => update('credentialProfileId', item.id)}
                >
                  {item.name}
                </FilterChip>
              ))}
          </div>
        </Field>
        <Field label={t('sources.inspector.network')}>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={!form.networkProfileId}
              onClick={() => update('networkProfileId', undefined)}
            >
              {t('sources.inspector.none')}
            </FilterChip>
            {profiles.data
              ?.filter((item) => item.enabled)
              .map((item) => (
                <FilterChip
                  key={item.id}
                  selected={form.networkProfileId === item.id}
                  onClick={() => update('networkProfileId', item.id)}
                >
                  {item.name}
                </FilterChip>
              ))}
          </div>
        </Field>
        <Switch
          checked={form.freshOnly}
          label={t('sources.inspector.freshOnly')}
          onCheckedChange={(checked) => update('freshOnly', checked)}
        />
        <Field label={t('sources.inspector.timeout')}>
          <Input
            type="number"
            min={1}
            max={120000}
            value={form.timeoutMs}
            onChange={change('timeoutMs')}
          />
        </Field>
      </Panel>
      <Button
        leadingIcon={<Play size={17} />}
        actionState={mutation.status}
        disabled={!canRun}
        onClick={() => run()}
      >
        {t('sources.inspector.run')}
      </Button>
      {mutation.error ? <ErrorBanner error={mutation.error} /> : null}
      {mutation.data ? (
        <div className="space-y-3">
          <SourceReaderResultView result={mutation.data} rawLabel={t('sources.inspector.raw')} />
          {nextCursor ? (
            <Button
              variant="secondary"
              leadingIcon={<StepForward size={17} />}
              actionState={mutation.status}
              onClick={() => run(nextCursor)}
            >
              {t('sources.inspector.nextPage')}
            </Button>
          ) : null}
        </div>
      ) : !mutation.isPending ? (
        <EmptyState title={t('sources.inspector.empty')} />
      ) : null}
    </div>
  );
}
