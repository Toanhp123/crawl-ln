import { Play, StepForward } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useI18n } from '../../../shared/i18n';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  FilterChip,
  Input,
  Panel,
  Switch
} from '../../../shared/ui';
import {
  sourceInspectorOperations,
  type SourceInspectorFormState
} from '../model/source-inspector';
import { useSourceInspector } from '../model/use-source-inspector';
import { SourceReaderResultView } from './SourceReaderResultView';
export function InspectSourceUrl() {
  const { t, status } = useI18n();
  const controller = useSourceInspector();
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
  const change =
    <Key extends keyof SourceInspectorFormState>(key: Key) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      update(key, event.target.value as SourceInspectorFormState[Key]);
  const paginated =
    form.operation === 'chapter-list' ||
    form.operation === 'latest-updates' ||
    form.operation === 'search';
  return (
    <div className="space-y-4">
      <Field label={t('inspectSourceUrl.operation')}>
        <div className="flex flex-wrap gap-2">
          {sourceInspectorOperations.map((operation) => (
            <FilterChip
              key={operation}
              selected={form.operation === operation}
              onClick={() => selectOperation(operation)}
            >
              {status(operation)}
            </FilterChip>
          ))}
        </div>
      </Field>
      <Field label={t('inspectSourceUrl.url')}>
        <Input type="url" value={form.url} onChange={change('url')} />
      </Field>
      {form.operation === 'search' ? (
        <Field label={t('inspectSourceUrl.query')}>
          <Input value={form.query} onChange={change('query')} />
        </Field>
      ) : null}
      {paginated ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inspectSourceUrl.cursor')}>
            <Input value={form.cursor} onChange={change('cursor')} />
          </Field>
          <Field label={t('inspectSourceUrl.limit')}>
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
        <Field label={t('inspectSourceUrl.credential')}>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={!form.credentialProfileId}
              onClick={() => update('credentialProfileId', undefined)}
            >
              {t('inspectSourceUrl.none')}
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
        <Field label={t('inspectSourceUrl.network')}>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={!form.networkProfileId}
              onClick={() => update('networkProfileId', undefined)}
            >
              {t('inspectSourceUrl.none')}
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
          label={t('inspectSourceUrl.fresh')}
          onCheckedChange={(checked) => update('freshOnly', checked)}
        />
        <Field label={t('inspectSourceUrl.timeout')}>
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
        {t('inspectSourceUrl.run')}
      </Button>
      {mutation.error ? <ErrorBanner error={mutation.error} /> : null}
      {mutation.data ? (
        <div className="space-y-3">
          <SourceReaderResultView result={mutation.data} rawLabel={t('inspectSourceUrl.raw')} />
          {nextCursor ? (
            <Button
              variant="secondary"
              leadingIcon={<StepForward size={17} />}
              actionState={mutation.status}
              onClick={() => run(nextCursor)}
            >
              {t('inspectSourceUrl.next')}
            </Button>
          ) : null}
        </div>
      ) : !mutation.isPending ? (
        <EmptyState title={t('inspectSourceUrl.empty')} />
      ) : null}
    </div>
  );
}
