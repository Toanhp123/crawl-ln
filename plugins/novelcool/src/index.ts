import {
  defineSourcePlugin,
  SourcePluginError,
  type ChapterContent,
  type ChapterSummary,
  type ExternalPluginContext,
  type ExternalPluginHtmlDocument,
  type ExternalSourcePlugin,
  type NovelMetadata,
  type Page,
  type PluginOperationResult,
  type SourcePluginErrorCode,
  type SourceIdentity
} from '@novel-tool/source-plugin-sdk';
import {
  NOVELCOOL_AUTHOR_SELECTORS,
  NOVELCOOL_CHAPTER_TITLE_SELECTORS,
  NOVELCOOL_CONTENT_REMOVE_SELECTOR,
  NOVELCOOL_CONTENT_SELECTORS,
  NOVELCOOL_COVER_SELECTORS,
  NOVELCOOL_DESCRIPTION_SELECTORS,
  NOVELCOOL_HOST,
  NOVELCOOL_METADATA_TITLE_SELECTORS,
  novelCoolMinimumChapterContentChars
} from './novelcool.config.js';
import { sanitizeChapterText } from './novelcool-content-sanitizer.js';
import {
  classifyNovelCoolPage,
  novelCoolChapterSelectors,
  type NovelCoolPageDiagnostics
} from './novelcool-page-classifier.js';
import { chapterContent, firstAttr, firstNodeText, firstText } from './novelcool.parsers.js';
import {
  canonicalChapterContentUrl,
  isNovelCoolContentPath,
  isNovelCoolHost,
  novelCoolChapterKey,
  novelCoolPageType
} from './novelcool-url.js';

export interface NovelCoolPluginOptions {
  minimumChapterContentChars?: number;
}

function assertNotCancelled(context: ExternalPluginContext): void {
  if (context.signal.aborted) {
    throw new SourcePluginError('SOURCE_READER_CANCELLED', 'Request cancelled');
  }
}

export function canHandleNovelCool(normalizedUrl: string, domain: string): boolean {
  return isNovelCoolHost(domain) && isNovelCoolContentPath(normalizedUrl);
}

export async function identifyNovelCool(
  url: string,
  context: ExternalPluginContext
): Promise<PluginOperationResult<SourceIdentity>> {
  assertNotCancelled(context);
  const normalizedUrl = await context.url.normalize(url);
  const parsed = new URL(normalizedUrl);
  return {
    data: {
      normalizedUrl,
      domain: parsed.hostname,
      pageType: novelCoolPageType(normalizedUrl)
    }
  };
}

function pageFailureCode(
  diagnostics: Awaited<ReturnType<typeof classifyNovelCoolPage>>
): SourcePluginErrorCode | undefined {
  switch (diagnostics.pageClassification) {
    case 'challenge':
    case 'login':
      return 'UPSTREAM_CHALLENGE_DETECTED';
    case 'rate-limited':
      return 'SOURCE_RATE_LIMITED';
    case 'unavailable':
      return 'SOURCE_TEMPORARILY_UNAVAILABLE';
    default:
      return undefined;
  }
}

function throwPageFailure(code: SourcePluginErrorCode): never {
  switch (code) {
    case 'UPSTREAM_CHALLENGE_DETECTED':
      throw new SourcePluginError(
        code,
        'NovelCool returned an access challenge instead of readable content'
      );
    case 'SOURCE_RATE_LIMITED':
      throw new SourcePluginError(code, 'NovelCool rate limited the request');
    case 'SOURCE_TEMPORARILY_UNAVAILABLE':
      throw new SourcePluginError(code, 'NovelCool content is temporarily unavailable');
    default:
      throw new SourcePluginError(code, 'NovelCool source request failed');
  }
}

function assertReadablePage(diagnostics: Awaited<ReturnType<typeof classifyNovelCoolPage>>): void {
  const failureCode = pageFailureCode(diagnostics);
  if (failureCode) throwPageFailure(failureCode);
}

function assertUsableHttpStatus(status: number): void {
  if (status < 400) return;
  if (status === 429) {
    throw new SourcePluginError('SOURCE_RATE_LIMITED', 'NovelCool rate limited the request');
  }
  if (status === 401 || status === 403) {
    throw new SourcePluginError('NETWORK_ACCESS_BLOCKED', 'NovelCool blocked source access');
  }
  throw new SourcePluginError(
    'SOURCE_TEMPORARILY_UNAVAILABLE',
    `NovelCool returned HTTP ${status}`
  );
}

export async function readNovelCoolMetadata(
  url: string,
  context: ExternalPluginContext,
  _options: NovelCoolPluginOptions = {}
): Promise<PluginOperationResult<NovelMetadata>> {
  assertNotCancelled(context);
  const response = await context.http.get(url);
  assertNotCancelled(context);
  const finalUrl = response.url || url;
  const document = context.html.load(response.data);
  const diagnostics = await classifyNovelCoolPage({ html: response.data, finalUrl, document });
  assertReadablePage(diagnostics);

  const title = await firstText(document, NOVELCOOL_METADATA_TITLE_SELECTORS);
  if (title.length < 2) {
    throw new SourcePluginError('PLUGIN_RESULT_INVALID', 'NovelCool title was not found');
  }

  const cover = await firstAttr(document, NOVELCOOL_COVER_SELECTORS, 'src');
  return {
    data: {
      title,
      sourceUrl: await context.url.normalize(finalUrl),
      sourceName: 'NovelCool',
      author: (await firstText(document, NOVELCOOL_AUTHOR_SELECTORS)) || undefined,
      coverUrl: cover ? await context.url.resolve(cover, finalUrl) : undefined,
      description: (await firstText(document, NOVELCOOL_DESCRIPTION_SELECTORS)) || undefined
    },
    cacheHints: {
      scope: 'public',
      ttlMs: 30 * 60_000,
      staleWhileRevalidateMs: 6 * 60 * 60_000
    }
  };
}

function isChapterUrl(value: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(value);
    const base = new URL(baseUrl);
    return (
      isNovelCoolHost(parsed.hostname) &&
      isNovelCoolHost(base.hostname) &&
      /\/chapter\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function chapterNumber(value: string): number | undefined {
  const match = value.match(/(?:chapter|ch(?:apter)?\.?)[\s_:/-]*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

function candidateScore(candidate: { title: string; url: string }): number {
  return candidate.title.length * 10 + (/\/Chapter-[^/]+\/\d+\/?$/i.test(candidate.url) ? 1 : 0);
}

async function extractChapters(
  document: ExternalPluginHtmlDocument,
  context: ExternalPluginContext,
  finalUrl: string
): Promise<ChapterSummary[]> {
  let nodes = [] as Awaited<ReturnType<ExternalPluginHtmlDocument['all']>>;
  for (const selector of novelCoolChapterSelectors) {
    assertNotCancelled(context);
    const matches = await document.all(selector);
    if (matches.length > 0) {
      nodes = matches;
      break;
    }
  }
  if (nodes.length === 0) {
    assertNotCancelled(context);
    nodes = await document.all('a');
  }

  const positions = new Map<string, number>();
  const candidates: Array<{ title: string; url: string }> = [];
  for (const node of nodes) {
    assertNotCancelled(context);
    const href = (await node.attr('href'))?.trim();
    if (!href) continue;
    const resolved = await context.url.resolve(href, finalUrl);
    assertNotCancelled(context);
    if (!isChapterUrl(resolved, finalUrl)) continue;
    const normalized = new URL(resolved);
    normalized.hash = '';
    const candidate = {
      title: (await firstNodeText(node, ['span'])) || `Chapter ${candidates.length + 1}`,
      url: normalized.toString()
    };
    const key = novelCoolChapterKey(candidate.url);
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, candidates.length);
      candidates.push(candidate);
      continue;
    }
    if (candidateScore(candidate) > candidateScore(candidates[position]!)) {
      candidates[position] = candidate;
    }
  }

  const first = candidates[0]
    ? chapterNumber(`${candidates[0].title} ${candidates[0].url}`)
    : undefined;
  const last = candidates.at(-1)
    ? chapterNumber(`${candidates.at(-1)!.title} ${candidates.at(-1)!.url}`)
    : undefined;
  const ordered =
    first !== undefined && last !== undefined && first > last
      ? [...candidates].reverse()
      : candidates;
  return ordered.map((chapter, index) => ({ ...chapter, index: index + 1 }));
}

export async function readNovelCoolChapterList(
  url: string,
  cursor: string | undefined,
  context: ExternalPluginContext
): Promise<PluginOperationResult<Page<ChapterSummary>>> {
  if (cursor) {
    throw new SourcePluginError('CURSOR_INVALID', 'NovelCool uses module-managed cursors');
  }

  assertNotCancelled(context);
  const response = await context.http.get(url);
  assertNotCancelled(context);
  const finalUrl = response.url || url;
  const document = context.html.load(response.data);
  const diagnostics = await classifyNovelCoolPage({ html: response.data, finalUrl, document });
  assertReadablePage(diagnostics);
  const items = await extractChapters(document, context, finalUrl);
  if (items.length === 0) {
    throw new SourcePluginError('PLUGIN_RESULT_INVALID', 'NovelCool chapter list is empty');
  }

  return {
    data: { items, hasMore: false },
    cacheHints: {
      scope: 'public',
      ttlMs: 5 * 60_000,
      staleWhileRevalidateMs: 60 * 60_000
    }
  };
}

export interface NovelCoolChapterAttemptDiagnostics {
  attempt: number;
  requestedUrl: string;
  finalUrl: string;
  pageClassification: NovelCoolPageDiagnostics['pageClassification'];
  title: string;
  selectorCounts: Record<string, number>;
  rawChars: number;
  cleanChars: number;
}

export interface NovelCoolChapterAttempt {
  usable: boolean;
  result: PluginOperationResult<ChapterContent>;
  diagnostics: NovelCoolChapterAttemptDiagnostics;
  failureCode?: SourcePluginErrorCode;
}

function boundedDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().slice(0, 512);
  } catch {
    return '[invalid-url]';
  }
}

function chapterContentResult(
  title: string,
  url: string,
  rawText: string,
  cleanText: string
): PluginOperationResult<ChapterContent> {
  return {
    data: { title, url, rawText, cleanText },
    cacheHints: { scope: 'public', ttlMs: 30 * 24 * 60 * 60_000, immutable: true }
  };
}

async function countContentSelectors(
  document: ExternalPluginHtmlDocument,
  context: ExternalPluginContext
): Promise<Record<string, number>> {
  const counts: Array<readonly [string, number]> = [];
  for (const selector of NOVELCOOL_CONTENT_SELECTORS) {
    assertNotCancelled(context);
    counts.push([selector, (await document.all(selector)).length] as const);
  }
  return Object.fromEntries(counts);
}

export async function readNovelCoolChapterAttempt(
  url: string,
  context: ExternalPluginContext,
  options: { attempt?: number; minimumChapterContentChars?: number } = {}
): Promise<NovelCoolChapterAttempt> {
  const minimumChapterContentChars = Math.max(
    1,
    Math.trunc(options.minimumChapterContentChars ?? novelCoolMinimumChapterContentChars)
  );
  const attempt = Math.max(1, Math.trunc(options.attempt ?? 1));

  assertNotCancelled(context);
  const response = await context.http.get(url);
  assertNotCancelled(context);
  assertUsableHttpStatus(response.status);
  const finalUrl = response.url || url;
  const document = context.html.load(response.data);
  const pageDiagnostics = await classifyNovelCoolPage({ html: response.data, finalUrl, document });
  const selectorCounts = {
    ...pageDiagnostics.selectorCounts,
    ...(await countContentSelectors(document, context))
  };
  const pageFailure = pageFailureCode(pageDiagnostics);
  const title = pageFailure
    ? pageDiagnostics.title.slice(0, 160) || 'Chapter'
    : (await firstText(document, NOVELCOOL_CHAPTER_TITLE_SELECTORS)).slice(0, 160) || 'Chapter';
  if (pageFailure) {
    const normalizedUrl = await context.url.normalize(finalUrl);
    return {
      usable: false,
      failureCode: pageFailure,
      result: chapterContentResult(title, normalizedUrl, '', ''),
      diagnostics: {
        attempt,
        requestedUrl: boundedDiagnosticUrl(url),
        finalUrl: boundedDiagnosticUrl(finalUrl),
        pageClassification: pageDiagnostics.pageClassification,
        title,
        selectorCounts,
        rawChars: 0,
        cleanChars: 0
      }
    };
  }
  assertNotCancelled(context);
  await document.remove(NOVELCOOL_CONTENT_REMOVE_SELECTOR);
  const rawText = await chapterContent(document, NOVELCOOL_CONTENT_SELECTORS);
  const cleanText = sanitizeChapterText(rawText, title);
  assertNotCancelled(context);
  const normalizedUrl = await context.url.normalize(finalUrl);
  const result = chapterContentResult(title, normalizedUrl, rawText, cleanText);

  return {
    usable: cleanText.length >= minimumChapterContentChars,
    result,
    diagnostics: {
      attempt,
      requestedUrl: boundedDiagnosticUrl(url),
      finalUrl: boundedDiagnosticUrl(finalUrl),
      pageClassification: pageDiagnostics.pageClassification,
      title,
      selectorCounts,
      rawChars: rawText.length,
      cleanChars: cleanText.length
    }
  };
}

async function logInvalidChapterAttempt(
  attempt: NovelCoolChapterAttempt,
  context: ExternalPluginContext
): Promise<void> {
  await context.logger.warn('novelcool.chapter_content_invalid', {
    attempt: attempt.diagnostics.attempt,
    requestedUrl: attempt.diagnostics.requestedUrl,
    finalUrl: attempt.diagnostics.finalUrl,
    pageClassification: attempt.diagnostics.pageClassification,
    title: attempt.diagnostics.title,
    selectorCounts: attempt.diagnostics.selectorCounts,
    rawChars: attempt.diagnostics.rawChars,
    cleanChars: attempt.diagnostics.cleanChars
  });
}

function invalidChapterContent(message: string): SourcePluginError {
  return new SourcePluginError('PLUGIN_RESULT_INVALID', message);
}

function throwChapterAttemptFailure(attempt: NovelCoolChapterAttempt): never {
  if (attempt.failureCode) throwPageFailure(attempt.failureCode);
  throw invalidChapterContent('NovelCool chapter content was invalid');
}

export async function readNovelCoolChapterContent(
  url: string,
  context: ExternalPluginContext,
  options: NovelCoolPluginOptions = {}
): Promise<PluginOperationResult<ChapterContent>> {
  const minimumChapterContentChars = Math.max(
    1,
    Math.trunc(options.minimumChapterContentChars ?? novelCoolMinimumChapterContentChars)
  );
  const initial = await readNovelCoolChapterAttempt(url, context, {
    attempt: 1,
    minimumChapterContentChars
  });
  if (initial.usable) return initial.result;
  if (initial.failureCode) throwChapterAttemptFailure(initial);

  await logInvalidChapterAttempt(initial, context);
  assertNotCancelled(context);
  const fallbackUrl = canonicalChapterContentUrl(url);
  if (!fallbackUrl) {
    throw invalidChapterContent('NovelCool chapter content was invalid for the initial URL');
  }

  const fallback = await readNovelCoolChapterAttempt(fallbackUrl, context, {
    attempt: 2,
    minimumChapterContentChars
  });
  if (fallback.usable) return fallback.result;

  await logInvalidChapterAttempt(fallback, context);
  if (fallback.failureCode) throwChapterAttemptFailure(fallback);
  throw invalidChapterContent(
    'NovelCool chapter content was invalid for the initial and canonical fallback URLs'
  );
}

export function createNovelCoolPlugin(options: NovelCoolPluginOptions = {}): ExternalSourcePlugin {
  return defineSourcePlugin({
    async initialize() {},
    async healthCheck() {
      return { status: 'healthy' as const };
    },
    async shutdown() {},
    async probeCanHandle(request) {
      return canHandleNovelCool(request.normalizedUrl, request.domain);
    },
    async identify(request, context) {
      return identifyNovelCool(request.url, context);
    },
    async readMetadata(request, context) {
      return readNovelCoolMetadata(request.url, context, options);
    },
    async readChapterList(request, context) {
      return readNovelCoolChapterList(request.url, request.cursor, context);
    },
    async readChapterContent(request, context) {
      return readNovelCoolChapterContent(request.url, context, options);
    }
  });
}

export { NOVELCOOL_HOST };

const plugin = createNovelCoolPlugin();
export default plugin;
