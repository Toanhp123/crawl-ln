import { SourceReaderError } from '../domain/errors/source-reader.error.js';
import type { SourceReaderApi } from '../public/source-reader.api.js';
import type {
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceIdentity,
  SourceReaderResult,
  StreamChapterListRequest
} from '../public/source-reader.models.js';
import type {
  ExecutableSourceCapability,
  SourceReaderExecutableRequest,
  SourceReaderPipelinePorts
} from './source-reader.ports.js';
import type { SourceRequestGatePort } from './ports/source-request-gate.port.js';
import type { CandidateResolver } from './services/candidate-resolver.js';
import type { HealthFallbackPolicy } from './services/health-fallback.policy.js';
import type { InvocationCoordinator } from './services/invocation-coordinator.js';
import type { PaginationCoordinator } from './services/pagination-coordinator.js';
import type { ReaderCachePolicy } from './services/reader-cache-policy.js';

const maxStreamPages = 10_000;

function isPaged(
  capability: ExecutableSourceCapability
): capability is 'chapter-list' | 'search' | 'latest-updates' {
  return ['chapter-list', 'search', 'latest-updates'].includes(capability);
}

interface SourceReaderFacadeOptions extends SourceReaderPipelinePorts {
  requestGate: Pick<SourceRequestGatePort, 'assertAllowed'>;
  candidates: CandidateResolver;
  cache: ReaderCachePolicy;
  invocation: InvocationCoordinator;
  pagination: PaginationCoordinator;
  health: HealthFallbackPolicy;
}

export class SourceReaderFacade implements SourceReaderApi {
  constructor(private readonly options: SourceReaderFacadeOptions) {}

  identify(request: IdentifyRequest) {
    return this.execute<SourceIdentity>('identify', request);
  }

  readMetadata(request: ReadMetadataRequest) {
    return this.execute<NovelMetadata>('metadata', request);
  }

  readChapterContent(request: ReadChapterContentRequest) {
    return this.execute<ChapterContent>('chapter-content', request);
  }

  readChapterList(request: ReadChapterListRequest) {
    return this.execute<Page<ChapterSummary>>('chapter-list', {
      ...request,
      limit: this.options.pagination.limit(request.limit)
    });
  }

  search(request: SearchSourceRequest) {
    return this.execute<Page<NovelSearchResult>>('search', {
      ...request,
      limit: this.options.pagination.limit(request.limit)
    });
  }

  latestUpdates(request: LatestUpdatesRequest) {
    return this.execute<Page<LatestUpdate>>('latest-updates', {
      ...request,
      limit: this.options.pagination.limit(request.limit)
    });
  }

  async *streamChapterList(request: StreamChapterListRequest) {
    const limit = this.options.pagination.limit(request.batchSize);
    let cursor: string | undefined;
    let pages = 0;
    const seen = new Set<string>();
    do {
      if (++pages > maxStreamPages) {
        throw new SourceReaderError(
          'SOURCE_RESPONSE_TOO_LARGE',
          'Chapter-list stream exceeded the page limit',
          { retryable: false, fallbackAllowed: false }
        );
      }
      const page = await this.readChapterList({ ...request, cursor, limit });
      yield { ...page, data: page.data.items };
      const next = page.data.nextCursor;
      if (next && (next === cursor || seen.has(next))) {
        throw new SourceReaderError(
          'PLUGIN_RESULT_INVALID',
          'Plugin chapter-list pagination did not make progress',
          { retryable: false, fallbackAllowed: true }
        );
      }
      if (next) seen.add(next);
      cursor = next;
    } while (cursor);
  }

  private async execute<T>(
    capability: ExecutableSourceCapability,
    request: SourceReaderExecutableRequest
  ): Promise<SourceReaderResult<T>> {
    await this.options.requestGate.assertAllowed(request.url, request.signal);
    const resolved = await this.options.candidates.resolve({ url: request.url, capability });
    const prepared = this.options.pagination.prepare({ capability, request, candidates: resolved });
    let lastError: unknown;

    for (const candidate of prepared.candidates) {
      const startedAt = this.options.health.now();
      try {
        this.options.pagination.validateBinding({
          capability,
          request,
          candidate,
          cursor: prepared.cursor
        });
        const context = await this.options.contexts.resolve({ candidate, capability, request });
        const cached = await this.options.cache.lookup<T>(
          { capability, candidate, context, request },
          () => this.execute(capability, { ...request, freshOnly: true })
        );
        if (cached) return cached;
        if (!(await this.options.health.isEligible(candidate, capability))) continue;

        const operation = await this.options.invocation.invoke({
          candidate,
          capability,
          request: this.options.pagination.pluginRequest({
            capability,
            request,
            cursor: prepared.cursor
          }),
          context,
          signal: request.signal,
          timeoutMs: request.timeoutMs
        });
        const validated = this.options.validator.validate(
          capability,
          operation.data,
          operation.extensions,
          candidate
        );
        let data = validated.data;
        if (isPaged(capability)) {
          data = this.options.pagination.applyPage({
            capability,
            candidate,
            request,
            page: data as Page<unknown>,
            cursor: prepared.cursor
          });
        }
        const result: SourceReaderResult<T> = {
          data: data as T,
          source: {
            pluginId: candidate.pluginId,
            pluginVersion: candidate.pluginVersion,
            domain: candidate.domain,
            capability
          },
          ...((validated.extensions ?? operation.extensions)
            ? { extensions: validated.extensions ?? operation.extensions }
            : {}),
          ...((operation.warnings?.length ?? 0) + (validated.warnings?.length ?? 0) > 0
            ? { warnings: [...(operation.warnings ?? []), ...(validated.warnings ?? [])] }
            : {})
        };
        await this.options.health.recordSuccess(candidate, capability, startedAt);
        await this.options.cache.store({
          capability,
          candidate,
          context,
          request,
          result,
          cacheHints: operation.cacheHints
        });
        return result;
      } catch (error) {
        lastError = error;
        await this.options.health.recordFailure(candidate, capability, startedAt, error);
        if (!this.options.health.allowsFallback(error)) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new SourceReaderError(
      'PLUGIN_UNAVAILABLE',
      `No available plugin completed ${capability}`,
      { retryable: true, fallbackAllowed: false }
    );
  }
}
