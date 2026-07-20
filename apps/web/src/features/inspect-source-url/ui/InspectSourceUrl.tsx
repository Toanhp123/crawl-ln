import type {
  SourceReaderChapterListRequest,
  SourceReaderInspectOperation,
  SourceReaderResult,
  SourceReaderSearchRequest,
  SourceReaderUrlRequest
} from '@novel-tool/shared';
import { Play, StepForward } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSourceCredentialsQuery } from '@/entities/source-credential';
import { useSourceNetworkProfilesQuery } from '@/entities/source-network-profile';
import {
  identifySource,
  readSourceChapterContent,
  readSourceChapterList,
  readSourceLatestUpdates,
  readSourceMetadata,
  searchSource,
  SourceReaderResultView
} from '@/entities/source-reader-result';
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

type InspectorRequest = SourceReaderUrlRequest & {
  query?: string;
  cursor?: string;
  limit?: number;
};
const operations: SourceReaderInspectOperation[] = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates'
];
function hasNextCursor(result: SourceReaderResult<unknown> | undefined): string | undefined {
  if (!result || typeof result.data !== 'object' || result.data === null) return undefined;
  const value = result.data as { nextCursor?: unknown };
  return typeof value.nextCursor === 'string' ? value.nextCursor : undefined;
}

export function InspectSourceUrl() {
  const { t } = useI18n();
  const credentials = useSourceCredentialsQuery();
  const profiles = useSourceNetworkProfilesQuery();
  const [operation, setOperation] = useState<SourceReaderInspectOperation>('identify');
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState('');
  const [limit, setLimit] = useState('20');
  const [credentialProfileId, setCredentialProfileId] = useState<string>();
  const [networkProfileId, setNetworkProfileId] = useState<string>();
  const [freshOnly, setFreshOnly] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState('15000');
  const mutation = useMutation({
    mutationFn: async ({
      request,
      selectedOperation
    }: {
      request: InspectorRequest;
      selectedOperation: SourceReaderInspectOperation;
    }): Promise<SourceReaderResult<unknown>> => {
      if (selectedOperation === 'identify') return identifySource(request);
      if (selectedOperation === 'metadata') return readSourceMetadata(request);
      if (selectedOperation === 'chapter-content') return readSourceChapterContent(request);
      if (selectedOperation === 'chapter-list')
        return readSourceChapterList(request as SourceReaderChapterListRequest);
      if (selectedOperation === 'latest-updates')
        return readSourceLatestUpdates(request as SourceReaderChapterListRequest);
      return searchSource(request as SourceReaderSearchRequest);
    }
  });
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
  const run = (nextCursor?: string) => {
    const parsedTimeout = Math.min(120000, Math.max(1, Number(timeoutMs) || 15000));
    const maxLimit = operation === 'search' ? 100 : 500;
    const parsedLimit = Math.min(maxLimit, Math.max(1, Number(limit) || 20));
    const request: InspectorRequest = {
      url: url.trim(),
      freshOnly,
      timeoutMs: parsedTimeout,
      ...(credentialProfileId ? { credentialProfileId } : {}),
      ...(networkProfileId ? { networkProfileId } : {}),
      ...(operation === 'chapter-list' || operation === 'latest-updates' || operation === 'search'
        ? { limit: parsedLimit, cursor: nextCursor ?? (cursor.trim() || undefined) }
        : {}),
      ...(operation === 'search' ? { query: query.trim() } : {})
    };
    mutation.mutate({ request, selectedOperation: operation });
  };
  const nextCursor = hasNextCursor(mutation.data);
  return (
    <div className="space-y-4">
      <Field label={t('sources.inspector.operation')}>
        <div className="flex flex-wrap gap-2">
          {operations.map((item) => (
            <FilterChip
              key={item}
              selected={operation === item}
              onClick={() => {
                setOperation(item);
                mutation.reset();
              }}
            >
              {operationLabel[item]}
            </FilterChip>
          ))}
        </div>
      </Field>
      <Field label={t('sources.inspector.url')}>
        <Input
          type="url"
          value={url}
          placeholder="https://example.com/novel"
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      {operation === 'search' ? (
        <Field label={t('sources.inspector.query')}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
      ) : null}
      {operation === 'chapter-list' || operation === 'latest-updates' || operation === 'search' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('sources.inspector.cursor')} hint={t('sources.common.optional')}>
            <Input value={cursor} onChange={(e) => setCursor(e.target.value)} />
          </Field>
          <Field label={t('sources.inspector.limit')}>
            <Input
              type="number"
              min={1}
              max={operation === 'search' ? 100 : 500}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      <Panel tone="inset" className="space-y-3">
        <Field label={t('sources.inspector.credential')}>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={!credentialProfileId}
              onClick={() => setCredentialProfileId(undefined)}
            >
              {t('sources.inspector.none')}
            </FilterChip>
            {credentials.data
              ?.filter((item) => item.enabled)
              .map((item) => (
                <FilterChip
                  key={item.id}
                  selected={credentialProfileId === item.id}
                  onClick={() => setCredentialProfileId(item.id)}
                >
                  {item.name}
                </FilterChip>
              ))}
          </div>
        </Field>
        <Field label={t('sources.inspector.network')}>
          <div className="flex flex-wrap gap-2">
            <FilterChip selected={!networkProfileId} onClick={() => setNetworkProfileId(undefined)}>
              {t('sources.inspector.none')}
            </FilterChip>
            {profiles.data
              ?.filter((item) => item.enabled)
              .map((item) => (
                <FilterChip
                  key={item.id}
                  selected={networkProfileId === item.id}
                  onClick={() => setNetworkProfileId(item.id)}
                >
                  {item.name}
                </FilterChip>
              ))}
          </div>
        </Field>
        <Switch
          checked={freshOnly}
          label={t('sources.inspector.freshOnly')}
          onCheckedChange={setFreshOnly}
        />
        <Field label={t('sources.inspector.timeout')}>
          <Input
            type="number"
            min={1}
            max={120000}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
          />
        </Field>
      </Panel>
      <Button
        leadingIcon={<Play size={17} />}
        actionState={mutation.status}
        disabled={!url.trim() || (operation === 'search' && !query.trim())}
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
