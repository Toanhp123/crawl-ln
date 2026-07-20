import type {
  SourceReaderInspectOperation,
  SourceReaderResult,
  SourceReaderUrlRequest
} from '@novel-tool/shared';

export type SourceInspectorFormState = {
  operation: SourceReaderInspectOperation;
  url: string;
  query: string;
  cursor: string;
  limit: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  freshOnly: boolean;
  timeoutMs: string;
};

export type SourceInspectionRequest = SourceReaderUrlRequest & {
  query?: string;
  cursor?: string;
  limit?: number;
};

export type SourceInspectionCommand = {
  operation: SourceReaderInspectOperation;
  request: SourceInspectionRequest;
};

export const sourceInspectorOperations: SourceReaderInspectOperation[] = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates'
];

export const createSourceInspectorForm = (): SourceInspectorFormState => ({
  operation: 'identify',
  url: '',
  query: '',
  cursor: '',
  limit: '20',
  credentialProfileId: undefined,
  networkProfileId: undefined,
  freshOnly: false,
  timeoutMs: '15000'
});

const paginated = (operation: SourceReaderInspectOperation) =>
  operation === 'chapter-list' || operation === 'latest-updates' || operation === 'search';

export function buildSourceInspectionCommand(
  form: SourceInspectorFormState,
  nextCursor?: string
): SourceInspectionCommand {
  const timeoutMs = Math.min(120000, Math.max(1, Number(form.timeoutMs) || 15000));
  const maxLimit = form.operation === 'search' ? 100 : 500;
  const limit = Math.min(maxLimit, Math.max(1, Number(form.limit) || 20));
  return {
    operation: form.operation,
    request: {
      url: form.url.trim(),
      freshOnly: form.freshOnly,
      timeoutMs,
      ...(form.credentialProfileId ? { credentialProfileId: form.credentialProfileId } : {}),
      ...(form.networkProfileId ? { networkProfileId: form.networkProfileId } : {}),
      ...(paginated(form.operation)
        ? { limit, cursor: nextCursor ?? (form.cursor.trim() || undefined) }
        : {}),
      ...(form.operation === 'search' ? { query: form.query.trim() } : {})
    }
  };
}

export const canRunSourceInspection = (form: SourceInspectorFormState) =>
  Boolean(form.url.trim() && (form.operation !== 'search' || form.query.trim()));

export function sourceInspectionNextCursor(
  result: SourceReaderResult<unknown> | undefined
): string | undefined {
  if (!result || typeof result.data !== 'object' || result.data === null) return undefined;
  const value = result.data as { nextCursor?: unknown };
  return typeof value.nextCursor === 'string' ? value.nextCursor : undefined;
}

export const sourceReaderResultJson = (result: SourceReaderResult<unknown>) =>
  JSON.stringify(result, null, 2);
